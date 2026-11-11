import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateStaffDto,
  type DepartmentDto,
  type SetPermissionOverridesDto,
  type UpdateStaffDto,
  type SessionUser,
  isSuperAdmin,
  isManager,
} from '@nodedr-restaurant/types';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, label: true } },
  departmentId: true,
  department: { select: { id: true, name: true } },
  permissionOverrides: {
    select: {
      effect: true,
      reason: true,
      expiresAt: true,
      permission: { select: { key: true } },
    },
  },
  branches: { select: { branch: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  listRoles(restaurantId: string, actor?: SessionUser) {
    return this.prisma.role.findMany({
      where: { restaurantId },
      orderBy: { label: 'asc' },
    }).then((roles) => {
      if (actor && !isSuperAdmin(actor.roleName)) {
        return roles.filter(
          (r) => !isSuperAdmin(r.name) && !isManager(r.name),
        );
      }
      return roles;
    });
  }

  async create(restaurantId: string, actor: SessionUser, dto: CreateStaffDto) {
    const targetRole = await this.assertRoleInRestaurant(restaurantId, dto.roleId);
    await this.assertBranchesInRestaurant(restaurantId, dto.branchIds);
    await this.assertDepartmentInRestaurant(restaurantId, dto.departmentId);

    // Role hierarchy enforcement:
    // If caller is not Super Admin, they cannot create Super Admin or Manager accounts
    if (!isSuperAdmin(actor.roleName)) {
      if (isSuperAdmin(targetRole.name) || isManager(targetRole.name)) {
        throw new ForbiddenException(
          'Managers can only create Cashier, Waiter, and Kitchen Staff accounts.',
        );
      }
    }

    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { restaurantId, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'A staff account with this email already exists',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        restaurantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        departmentId: dto.departmentId ?? undefined,
        passwordHash,
        branches: {
          create: dto.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select: SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: 'staff.created',
      entity: 'User',
      entityId: user.id,
      metadata: { name: user.name, email: user.email, roleId: user.roleId },
    });

    return user;
  }

  async update(
    restaurantId: string,
    actor: SessionUser,
    id: string,
    dto: UpdateStaffDto,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, restaurantId },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException('Staff account not found');
    }

    // You cannot deactivate your own account
    if (id === actor.id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    // Role hierarchy enforcement:
    // Non-Super Admins (e.g. Manager) cannot edit or deactivate Super Admin or Manager accounts
    if (!isSuperAdmin(actor.roleName)) {
      if (isSuperAdmin(existing.role.name) || isManager(existing.role.name)) {
        throw new ForbiddenException(
          'Only Super Admin can manage or modify Manager or Super Admin accounts.',
        );
      }
    }

    // Protect last active Super Admin/Owner
    if (
      (dto.isActive === false || dto.roleId) &&
      isSuperAdmin(existing.role.name)
    ) {
      const otherActiveSuperAdmins = await this.prisma.user.count({
        where: {
          restaurantId,
          isActive: true,
          id: { not: id },
          role: { name: { in: ['SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'] } },
        },
      });
      if (otherActiveSuperAdmins === 0) {
        throw new BadRequestException(
          'Cannot disable or change the role of the last active Super Admin',
        );
      }
    }

    if (dto.roleId) {
      const targetRole = await this.assertRoleInRestaurant(restaurantId, dto.roleId);
      // Non-Super Admins cannot grant Super Admin or Manager roles
      if (
        !isSuperAdmin(actor.roleName) &&
        (isSuperAdmin(targetRole.name) || isManager(targetRole.name))
      ) {
        throw new ForbiddenException(
          'Managers cannot assign Manager or Super Admin roles.',
        );
      }
    }
    if (dto.branchIds) {
      await this.assertBranchesInRestaurant(restaurantId, dto.branchIds);
    }
    await this.assertDepartmentInRestaurant(restaurantId, dto.departmentId);

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        departmentId: dto.departmentId,
        isActive: dto.isActive,
        passwordHash,
        ...(dto.branchIds
          ? {
              branches: {
                deleteMany: {},
                create: dto.branchIds.map((branchId) => ({ branchId })),
              },
            }
          : {}),
      },
      select: SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: 'staff.updated',
      entity: 'User',
      entityId: id,
      metadata: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        isActive: dto.isActive,
        branchIds: dto.branchIds,
        passwordChanged: Boolean(dto.password),
      },
    });

    return updated;
  }

  async remove(restaurantId: string, actor: SessionUser, id: string) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, restaurantId },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException('Staff account not found');
    }

    // Role hierarchy enforcement:
    // Non-Super Admins cannot delete Super Admin or Manager accounts
    if (!isSuperAdmin(actor.roleName)) {
      if (isSuperAdmin(existing.role.name) || isManager(existing.role.name)) {
        throw new ForbiddenException(
          'Only Super Admin can delete or manage Manager or Super Admin accounts.',
        );
      }
    }

    if (isSuperAdmin(existing.role.name)) {
      const otherActiveOwners = await this.prisma.user.count({
        where: {
          restaurantId,
          isActive: true,
          id: { not: id },
          role: { name: { in: ['SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'] } },
        },
      });
      if (otherActiveOwners === 0) {
        throw new BadRequestException('Cannot delete the last active Super Admin');
      }
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'This staff account has order, purchase, or inventory history and cannot be deleted. Disable it instead.',
        );
      }
      throw err;
    }

    await this.audit.record({
      userId: actor.id,
      action: 'staff.deleted',
      entity: 'User',
      entityId: id,
      metadata: { name: existing.name, email: existing.email },
    });

    return { ok: true };
  }

  // --- Departments ---------------------------------------------------------

  listDepartments(restaurantId: string) {
    return this.prisma.department.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async createDepartment(
    restaurantId: string,
    actorId: string,
    dto: DepartmentDto,
  ) {
    try {
      const dept = await this.prisma.department.create({
        data: { restaurantId, name: dto.name },
      });
      await this.audit.record({
        userId: actorId,
        action: 'department.created',
        entity: 'Department',
        entityId: dept.id,
        metadata: { name: dept.name },
      });
      return dept;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A department with this name already exists',
        );
      }
      throw err;
    }
  }

  async renameDepartment(
    restaurantId: string,
    actorId: string,
    id: string,
    dto: DepartmentDto,
  ) {
    const existing = await this.prisma.department.findFirst({
      where: { id, restaurantId },
    });
    if (!existing) throw new NotFoundException('Department not found');
    try {
      const dept = await this.prisma.department.update({
        where: { id },
        data: { name: dto.name },
      });
      await this.audit.record({
        userId: actorId,
        action: 'department.renamed',
        entity: 'Department',
        entityId: id,
        metadata: { from: existing.name, to: dto.name },
      });
      return dept;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A department with this name already exists',
        );
      }
      throw err;
    }
  }

  async removeDepartment(restaurantId: string, actorId: string, id: string) {
    const existing = await this.prisma.department.findFirst({
      where: { id, restaurantId },
    });
    if (!existing) throw new NotFoundException('Department not found');
    // users.departmentId is ON DELETE SET NULL: staff are kept, just unassigned.
    await this.prisma.department.delete({ where: { id } });
    await this.audit.record({
      userId: actorId,
      action: 'department.deleted',
      entity: 'Department',
      entityId: id,
      metadata: { name: existing.name },
    });
    return { ok: true };
  }

  // --- Per-user permission overrides ---------------------------------------

  /**
   * Replace a user's overrides. Guard rails:
   *  - you can't change your own overrides (no self-escalation or self-lockout),
   *  - the OWNER role is never overridable (can't strand the account),
   *  - you can only GRANT a permission you hold yourself (no escalation),
   *  - unknown keys and duplicate keys are rejected, past expiries too.
   */
  async setPermissionOverrides(
    restaurantId: string,
    actor: { id: string; permissions: string[] },
    targetId: string,
    dto: SetPermissionOverridesDto,
  ) {
    if (targetId === actor.id) {
      throw new BadRequestException(
        'You cannot change your own permission overrides',
      );
    }
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, restaurantId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('Staff account not found');
    if (target.role.name === 'OWNER') {
      throw new BadRequestException(
        'The owner role cannot have permission overrides',
      );
    }

    const keys = dto.overrides.map((o) => o.permissionKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Each permission can appear only once');
    }
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(perms.map((p) => [p.key, p]));
    const now = Date.now();
    for (const o of dto.overrides) {
      if (!byKey.has(o.permissionKey)) {
        throw new BadRequestException(`Unknown permission: ${o.permissionKey}`);
      }
      if (
        o.effect === 'GRANT' &&
        !actor.permissions.includes(o.permissionKey)
      ) {
        throw new BadRequestException(
          `You cannot grant "${o.permissionKey}" because you do not hold it yourself`,
        );
      }
      if (o.expiresAt && new Date(o.expiresAt).getTime() <= now) {
        throw new BadRequestException('Expiry must be in the future');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userPermissionOverride.deleteMany({
        where: { userId: targetId },
      }),
      this.prisma.userPermissionOverride.createMany({
        data: dto.overrides.map((o) => ({
          userId: targetId,
          permissionId: byKey.get(o.permissionKey)!.id,
          effect: o.effect,
          reason: o.reason || null,
          expiresAt: o.expiresAt ? new Date(o.expiresAt) : null,
        })),
      }),
    ]);

    await this.audit.record({
      userId: actor.id,
      action: 'staff.permissions_overridden',
      entity: 'User',
      entityId: targetId,
      metadata: {
        overrides: dto.overrides.map((o) => ({
          key: o.permissionKey,
          effect: o.effect,
          expiresAt: o.expiresAt ?? null,
        })),
      },
    });

    return this.prisma.user.findFirstOrThrow({
      where: { id: targetId },
      select: SELECT,
    });
  }

  private async assertDepartmentInRestaurant(
    restaurantId: string,
    departmentId: string | null | undefined,
  ) {
    if (!departmentId) return;
    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, restaurantId },
    });
    if (!dept)
      throw new BadRequestException('Department not found for this restaurant');
  }

  private async assertRoleInRestaurant(restaurantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, restaurantId },
    });
    if (!role) {
      throw new BadRequestException('Role not found for this restaurant');
    }
    return role;
  }

  private async assertBranchesInRestaurant(
    restaurantId: string,
    branchIds: string[],
  ) {
    const count = await this.prisma.branch.count({
      where: { id: { in: branchIds }, restaurantId },
    });
    if (count !== branchIds.length) {
      throw new BadRequestException('One or more branches are invalid');
    }
  }
}
