import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, STAFF_ROLES } from '@nodedr-restaurant/types';
import { PrismaService } from '../prisma/prisma.service';

// Roles this deep are meant to always hold every permission that exists —
// see DEFAULT_ROLE_PERMISSIONS in packages/types.
const ALWAYS_FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'] as const;

// A permission that is new in a release can also be granted to the role that
// should have it by default, but only at the moment it is first created - so an
// admin who later removes it is not overruled on the next restart.
const GRANT_WHEN_CREATED: Record<string, string[]> = {
  'delivery.rider': ['DELIVERY_STAFF'],
  'offers.manage': ['MANAGER', 'RESTAURANT_MANAGER'],
  'offers.view': ['MANAGER', 'RESTAURANT_MANAGER', 'CASHIER'],
};

@Injectable()
export class PermissionsSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.sync();
  }

  async sync() {
    const known = new Set(
      (await this.prisma.permission.findMany({ select: { key: true } })).map(
        (p) => p.key,
      ),
    );
    for (const permission of PERMISSIONS) {
      const row = await this.prisma.permission.upsert({
        where: { key: permission.key },
        update: { label: permission.label, category: permission.category },
        create: permission,
      });
      const roleNames = GRANT_WHEN_CREATED[permission.key];
      if (roleNames && !known.has(permission.key)) {
        const roles = await this.prisma.role.findMany({
          where: { name: { in: roleNames } },
          select: { id: true },
        });
        await this.prisma.rolePermission.createMany({
          data: roles.map((r) => ({ roleId: r.id, permissionId: row.id })),
          skipDuplicates: true,
        });
        this.logger.log(
          `Granted new permission ${permission.key} to ${roles.length} ${roleNames.join('/')} role(s)`,
        );
      }
    }
    const allPermissions = await this.prisma.permission.findMany();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

    // Ensure all restaurants have SUPER_ADMIN and MANAGER roles seeded
    const restaurants = await this.prisma.restaurant.findMany({ select: { id: true } });
    for (const r of restaurants) {
      for (const roleName of ['SUPER_ADMIN', 'MANAGER'] as const) {
        const existingRole = await this.prisma.role.findUnique({
          where: { restaurantId_name: { restaurantId: r.id, name: roleName } },
        });
        if (!existingRole) {
          const createdRole = await this.prisma.role.create({
            data: {
              restaurantId: r.id,
              name: roleName,
              label: roleName === 'SUPER_ADMIN' ? 'Super Admin' : 'Manager',
            },
          });
          const grantedKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
          await this.prisma.rolePermission.createMany({
            data: grantedKeys
              .map((k) => permissionByKey.get(k))
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .map((p) => ({ roleId: createdRole.id, permissionId: p.id })),
            skipDuplicates: true,
          });
          this.logger.log(`Created missing role ${roleName} for restaurant ${r.id}`);
        }
      }
    }

    // Role hygiene for existing DB instances:
    // Remove bills.print from WAITER so Waiters cannot confirm checkout payments
    const billsPrintPermission = permissionByKey.get('bills.print');
    if (billsPrintPermission) {
      const waiterRoles = await this.prisma.role.findMany({
        where: { name: 'WAITER' },
        select: { id: true },
      });
      if (waiterRoles.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: {
            permissionId: billsPrintPermission.id,
            roleId: { in: waiterRoles.map((w) => w.id) },
          },
        });
      }
    }

    // Remove dashboard.sales.view from CASHIER so Cashiers cannot view revenue/financial dashboards
    const dashboardSalesPermission = permissionByKey.get('dashboard.sales.view');
    if (dashboardSalesPermission) {
      const cashierRoles = await this.prisma.role.findMany({
        where: { name: 'CASHIER' },
        select: { id: true },
      });
      if (cashierRoles.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: {
            permissionId: dashboardSalesPermission.id,
            roleId: { in: cashierRoles.map((c) => c.id) },
          },
        });
      }
    }

    // Remove tables.manage from WAITER and CASHIER so only Manager/Super Admin can add/edit/deactivate tables
    const tablesManagePermission = permissionByKey.get('tables.manage');
    if (tablesManagePermission) {
      const staffRoles = await this.prisma.role.findMany({
        where: { name: { in: ['WAITER', 'CASHIER'] } },
        select: { id: true },
      });
      if (staffRoles.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: {
            permissionId: tablesManagePermission.id,
            roleId: { in: staffRoles.map((r) => r.id) },
          },
        });
      }
    }

    // Role hygiene for Offers & Discounts (Phase 06):
    // Waiters and Kitchen Staff must never hold discounts.apply or offers.manage
    const restrictedKeys = ['discounts.apply', 'offers.manage'];
    const restrictedPermissions = restrictedKeys
      .map((k) => permissionByKey.get(k))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (restrictedPermissions.length > 0) {
      const restrictedRoles = await this.prisma.role.findMany({
        where: { name: { in: ['WAITER', 'KITCHEN_STAFF'] } },
        select: { id: true },
      });
      if (restrictedRoles.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: {
            permissionId: { in: restrictedPermissions.map((p) => p.id) },
            roleId: { in: restrictedRoles.map((r) => r.id) },
          },
        });
      }
    }

    // Kitchen Staff must not access offers.view
    const offersViewPermission = permissionByKey.get('offers.view');
    if (offersViewPermission) {
      const kitchenRoles = await this.prisma.role.findMany({
        where: { name: 'KITCHEN_STAFF' },
        select: { id: true },
      });
      if (kitchenRoles.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: {
            permissionId: offersViewPermission.id,
            roleId: { in: kitchenRoles.map((k) => k.id) },
          },
        });
      }
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: [...ALWAYS_FULL_ACCESS_ROLES] } },
      include: { permissions: true },
    });

    for (const role of roles) {
      const grantedIds = new Set(role.permissions.map((p) => p.permissionId));
      const missing = allPermissions.filter((p) => !grantedIds.has(p.id));
      if (missing.length === 0) continue;

      await this.prisma.rolePermission.createMany({
        data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      this.logger.log(
        `Backfilled ${missing.length} new permission(s) onto role ${role.id} (${role.name})`,
      );
    }
  }
}
