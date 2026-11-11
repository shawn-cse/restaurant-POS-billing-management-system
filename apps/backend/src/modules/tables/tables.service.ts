import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BulkTableCreateDto,
  FloorDto,
  FloorUpdateDto,
  SessionUser,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
} from '@nodedr-restaurant/types';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  listFloors(branchId: string) {
    return this.prisma.floor.findMany({
      where: { branchId },
      orderBy: { sortOrder: 'asc' },
      include: {
        tables: {
          orderBy: { number: 'asc' },
          include: {
            assignedWaiter: { select: { id: true, name: true } },
            orders: {
              where: { status: { in: ['OPEN', 'BILLED'] } },
              take: 1,
              select: {
                id: true,
                orderNumber: true,
                type: true,
                status: true,
                guestCount: true,
                guestName: true,
                totalAmount: true,
                createdAt: true,
                createdBy: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
  }

  createFloor(branchId: string, dto: FloorDto) {
    return this.prisma.floor.create({ data: { ...dto, branchId } });
  }

  async updateFloor(branchId: string, id: string, dto: FloorUpdateDto) {
    await this.assertFloorInBranch(branchId, id);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async createTable(branchId: string, dto: TableDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);

    const normalizedNumber = dto.number.trim();
    const normalizedName = dto.name?.trim();

    // Prevent duplicate active table numbers/names on the same floor or branch
    const duplicateChecks: Prisma.TableWhereInput[] = [
      { number: { equals: normalizedNumber, mode: Prisma.QueryMode.insensitive } },
    ];
    if (normalizedName) {
      duplicateChecks.push(
        { name: { equals: normalizedName, mode: Prisma.QueryMode.insensitive } },
        { number: { equals: normalizedName, mode: Prisma.QueryMode.insensitive } },
      );
    }

    const existing = await this.prisma.table.findFirst({
      where: {
        floor: { branchId },
        isActive: true,
        OR: duplicateChecks,
      },
    });
    if (existing) {
      throw new ConflictException(
        `An active table with identifier "${normalizedNumber}" or name "${normalizedName || normalizedNumber}" already exists in this branch.`,
      );
    }

    const table = await this.prisma.table.create({
      data: {
        ...dto,
        number: normalizedNumber,
        name: normalizedName || null,
        isActive: dto.isActive ?? true,
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async createTables(branchId: string, dto: BulkTableCreateDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);

    const numbers = dto.numbers.map((n) => n.trim()).filter(Boolean);
    const duplicatesInBatch = numbers.filter(
      (n, i) => numbers.indexOf(n) !== i,
    );
    if (duplicatesInBatch.length > 0) {
      throw new BadRequestException(
        `Table numbers must be unique: ${[...new Set(duplicatesInBatch)].join(', ')} ${duplicatesInBatch.length > 1 ? 'are' : 'is'} repeated.`,
      );
    }

    const existing = await this.prisma.table.findMany({
      where: {
        floor: { branchId },
        isActive: true,
        number: { in: numbers },
      },
      select: { number: true },
    });
    if (existing.length > 0) {
      const clashes = existing.map((t) => t.number).join(', ');
      throw new ConflictException(
        `These table numbers already exist on this branch/floor: ${clashes}. Choose different numbers.`,
      );
    }

    const tables = await this.prisma.$transaction(
      numbers.map((number, index) =>
        this.prisma.table.create({
          data: {
            floorId: dto.floorId,
            number,
            capacity: dto.capacity,
            shape: dto.shape,
            color: dto.color,
            isActive: true,
            posX: 20 + (index % 5) * 100,
            posY: 20 + Math.floor(index / 5) * 100,
          },
        }),
      ),
    );
    tables.forEach((table) =>
      this.realtime.emitToBranch(branchId, 'table.updated', table),
    );
    return tables;
  }

  async updateTable(branchId: string, id: string, dto: TableUpdateDto) {
    await this.assertTableInBranch(branchId, id);

    // Prevent duplicate active table identifiers
    if (dto.number || dto.name) {
      const checks: Prisma.TableWhereInput[] = [];
      if (dto.number) {
        checks.push({
          number: { equals: dto.number.trim(), mode: Prisma.QueryMode.insensitive },
        });
      }
      if (dto.name?.trim()) {
        checks.push({
          name: { equals: dto.name.trim(), mode: Prisma.QueryMode.insensitive },
        });
      }
      if (checks.length > 0) {
        const duplicate = await this.prisma.table.findFirst({
          where: {
            floor: { branchId },
            isActive: true,
            id: { not: id },
            OR: checks,
          },
        });
        if (duplicate) {
          throw new ConflictException(
            `Another active table with this number or name already exists in this branch.`,
          );
        }
      }
    }

    // Prevent deactivating a table with an active dining party
    if (dto.isActive === false) {
      const activeOrder = await this.prisma.order.findFirst({
        where: { tableId: id, status: { in: ['OPEN', 'BILLED'] } },
        select: { orderNumber: true },
      });
      if (activeOrder) {
        throw new ConflictException(
          `Cannot deactivate table with active order #${activeOrder.orderNumber}. Settle payment or cancel the order first.`,
        );
      }
    }

    const table = await this.prisma.table.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.number ? { number: dto.number.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name?.trim() || null } : {}),
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async updateTableLayout(branchId: string, updates: TableLayoutUpdateDto[]) {
    const owned = await this.prisma.table.findMany({
      where: { id: { in: updates.map((u) => u.id) }, floor: { branchId } },
      select: { id: true },
    });
    if (owned.length !== updates.length) {
      throw new BadRequestException(
        'One or more tables are invalid for this branch',
      );
    }

    const results = await this.prisma.$transaction(
      updates.map(({ id, ...rest }) =>
        this.prisma.table.update({ where: { id }, data: rest }),
      ),
    );
    this.realtime.emitToBranch(branchId, 'table.layout.updated', results);
    return results;
  }

  async updateTableStatus(
    branchId: string,
    id: string,
    status: TableStatusDto,
    assignedWaiterId?: string,
    override?: boolean,
    user?: SessionUser,
    reason?: string,
  ) {
    await this.assertTableInBranch(branchId, id);

    // When marking table AVAILABLE (releasing table) or RESERVED from an occupied state:
    // Reject release if an active bill/order would be left behind, unless authorized override
    if (status !== 'OCCUPIED') {
      const activeOrder = await this.prisma.order.findFirst({
        where: { tableId: id, status: { in: ['OPEN', 'BILLED'] } },
        select: { id: true, orderNumber: true },
      });
      if (activeOrder) {
        const canOverride =
          user &&
          (user.permissions?.includes('tables.manage') ||
            user.roleName === 'Super Admin' ||
            user.roleName === 'Manager' ||
            user.roleName === 'Owner' ||
            user.roleId === 'SUPER_ADMIN' ||
            user.roleId === 'MANAGER' ||
            user.roleId === 'OWNER');
        if (override && canOverride) {
          // Authorized override by Manager / Super Admin:
          // Disassociate table from active order and audit
          await this.prisma.order.update({
            where: { id: activeOrder.id },
            data: { tableId: null },
          });
          await this.audit.record({
            userId: user.id,
            action: 'table.force_released',
            entity: 'Table',
            entityId: id,
            metadata: {
              tableId: id,
              orderId: activeOrder.id,
              orderNumber: activeOrder.orderNumber,
              reason: reason || 'Manager authorized override table release',
            },
          });
        } else {
          throw new ConflictException(
            `This table has an active order (#${activeOrder.orderNumber}). Settle payment or cancel the order before releasing the table.`,
          );
        }
      }
    }

    const table = await this.prisma.table.update({
      where: { id },
      data: {
        status,
        statusSince: new Date(),
        ...(assignedWaiterId ? { assignedWaiterId } : {}),
      },
      include: {
        assignedWaiter: { select: { id: true, name: true } },
        orders: {
          where: { status: { in: ['OPEN', 'BILLED'] } },
          take: 1,
          select: {
            id: true,
            orderNumber: true,
            type: true,
            status: true,
            guestCount: true,
            guestName: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async releaseTable(
    branchId: string,
    id: string,
    user: SessionUser,
    force?: boolean,
    reason?: string,
  ) {
    if (force) {
      const isManagerOrAdmin =
        user.permissions?.includes('tables.manage') ||
        user.roleName === 'Super Admin' ||
        user.roleName === 'Manager' ||
        user.roleName === 'Owner' ||
        user.roleId === 'SUPER_ADMIN' ||
        user.roleId === 'MANAGER' ||
        user.roleId === 'OWNER';
      if (!isManagerOrAdmin) {
        throw new ForbiddenException(
          'Only Managers and Super Admins can perform an authorized override to force-release an occupied table.',
        );
      }
    }
    return this.updateTableStatus(
      branchId,
      id,
      'AVAILABLE',
      undefined,
      force,
      user,
      reason,
    );
  }

  async deleteTable(branchId: string, id: string) {
    await this.assertTableInBranch(branchId, id);

    // Preserve historical data: if table has associated orders, deactivate instead of delete
    const orderCount = await this.prisma.order.count({ where: { tableId: id } });
    if (orderCount > 0) {
      const table = await this.prisma.table.update({
        where: { id },
        data: { isActive: false, status: 'AVAILABLE' },
      });
      this.realtime.emitToBranch(branchId, 'table.updated', table);
      return {
        ok: true,
        deactivated: true,
        message:
          'This table is associated with past orders and has been deactivated instead of deleted.',
      };
    }

    await this.prisma.table.delete({ where: { id } });
    this.realtime.emitToBranch(branchId, 'table.deleted', { id });
    return { ok: true };
  }

  async rotateQrToken(branchId: string, id: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');

    // opaque, unguessable token — not the table's own id, so a leaked QR
    // image can't be used to enumerate other tables' ids/data
    const qrToken = randomBytes(16).toString('hex');
    return this.prisma.table.update({ where: { id }, data: { qrToken } });
  }

  private async assertFloorInBranch(branchId: string, floorId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, branchId },
    });
    if (!floor) throw new NotFoundException('Floor not found');
  }

  private async assertTableInBranch(branchId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');
  }

  /** Open guest requests (call waiter / bring bill) for a branch. */
  listOpenRequests(branchId: string) {
    return this.prisma.tableRequest.findMany({
      where: { branchId, resolvedAt: null },
      include: { table: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolveRequest(branchId: string, id: string) {
    const request = await this.prisma.tableRequest.findFirst({
      where: { id, branchId },
    });
    if (!request) throw new NotFoundException('Request not found');
    const updated = await this.prisma.tableRequest.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id });
    return updated;
  }
}
