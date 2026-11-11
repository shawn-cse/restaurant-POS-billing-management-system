import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BranchTimeService } from '../../common/services/branch-time.service';
import { localDate, zonedRange } from '../../common/time';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizePrefs, type DashboardPrefs } from './dashboard-prefs';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BranchTimeService,
  ) {}

  async getSummary(branchId: string, permissions: string[] = []) {
    const tz = await this.time.tzForBranch(branchId);
    const todayStr = localDate(new Date(), tz);
    const todayRange = zonedRange(todayStr, todayStr, tz);

    const [
      paymentsAgg,
      refundsAgg,
      ordersToday,
      completedOrdersCount,
      activeOrdersCount,
      pendingKitchenCount,
      orderTypeCounts,
      tableCounts,
      kitchenQueue,
      todayExpensesAgg,
      recentOrders,
    ] = await Promise.all([
      // Actual payments collected today
      this.prisma.payment.aggregate({
        where: { createdAt: todayRange, order: { branchId, status: 'PAID' } },
        _sum: { amount: true },
      }),
      // Actual refunds issued today
      this.prisma.refund.aggregate({
        where: { createdAt: todayRange, order: { branchId } },
        _sum: { amount: true },
      }),
      // Orders placed today
      this.prisma.order.count({
        where: { branchId, createdAt: todayRange },
      }),
      // Completed/paid orders today
      this.prisma.order.count({
        where: { branchId, status: 'PAID', billedAt: todayRange },
      }),
      // Active in-progress orders
      this.prisma.order.count({
        where: { branchId, status: { in: ['OPEN', 'BILLED'] } },
      }),
      // Kitchen orders currently in progress
      this.prisma.kot.count({
        where: {
          order: { branchId },
          status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] },
        },
      }),
      this.prisma.order.groupBy({
        by: ['channel'],
        where: { branchId, createdAt: todayRange },
        _count: true,
      }),
      this.prisma.table.groupBy({
        by: ['status'],
        where: { floor: { branchId }, isActive: true },
        _count: true,
      }),
      this.prisma.kot.groupBy({
        by: ['status'],
        where: {
          order: { branchId },
          status: { notIn: ['SERVED', 'CANCELLED', 'REJECTED'] },
        },
        _count: true,
      }),
      // Today's recorded operating expenses
      this.prisma.expense.aggregate({
        where: {
          branchId,
          spentOn: {
            gte: new Date(`${todayStr}T00:00:00.000Z`),
            lte: new Date(`${todayStr}T00:00:00.000Z`),
          },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.order.findMany({
        where: { branchId, status: 'PAID' },
        orderBy: { billedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          type: true,
          totalAmount: true,
          billedAt: true,
        },
      }),
    ]);

    const has = (p: string) => permissions.includes(p);
    const attention = await this.attention(branchId, has);

    const tableStatusMap = Object.fromEntries(
      tableCounts.map((row) => [row.status, row._count]),
    );
    const kitchenQueueMap = Object.fromEntries(
      kitchenQueue.map((row) => [row.status, row._count]),
    );

    const todayGrossSales = Number(paymentsAgg._sum.amount ?? 0);
    const todayRefunds = Number(refundsAgg._sum.amount ?? 0);
    const todayNetSales = Math.max(0, todayGrossSales - todayRefunds);
    const todayExpenses = Number(todayExpensesAgg._sum.amount ?? 0);
    const netSalesLessExpenses = Math.round((todayNetSales - todayExpenses) * 100) / 100;

    const channels = orderTypeCounts.reduce(
      (acc, row) => {
        if (row.channel === 'ONLINE') {
          acc.online += row._count;
        } else {
          acc.offline += row._count;
        }
        return acc;
      },
      { online: 0, offline: 0 },
    );

    return {
      todayRevenue: todayNetSales,
      todaySales: todayNetSales,
      todayGrossSales,
      todayRefunds,
      todayOrders: ordersToday,
      activeOrders: activeOrdersCount,
      pendingKitchenOrders: pendingKitchenCount,
      completedOrders: completedOrdersCount,
      availableTables: tableStatusMap.AVAILABLE ?? 0,
      occupiedTables: tableStatusMap.OCCUPIED ?? 0,
      reservedTables: tableStatusMap.RESERVED ?? 0,
      todayExpenses,
      netSalesLessExpenses,
      tables: {
        available: tableStatusMap.AVAILABLE ?? 0,
        occupied: tableStatusMap.OCCUPIED ?? 0,
        reserved: tableStatusMap.RESERVED ?? 0,
        cleaning: tableStatusMap.CLEANING ?? 0,
        outOfService: tableStatusMap.OUT_OF_SERVICE ?? 0,
      },
      kitchenQueue: {
        new: kitchenQueueMap.NEW ?? 0,
        accepted: kitchenQueueMap.ACCEPTED ?? 0,
        preparing: kitchenQueueMap.PREPARING ?? 0,
        ready: kitchenQueueMap.READY ?? 0,
      },
      channels,
      recentOrders,
      ...attention,
    };
  }

  // Figures that need a person to act. Each one is only computed (and so only
  // ever returned) for a role allowed to see it; the rest come back null.
  private async attention(branchId: string, has: (p: string) => boolean) {
    const [pending, lowStock, customers, employees, draftPayroll] =
      await Promise.all([
        // Bills with money taken but not settled: the balance still owed.
        this.prisma.order.findMany({
          where: {
            branchId,
            status: 'OPEN',
            payments: { some: {} },
          },
          select: { totalAmount: true, payments: { select: { amount: true } } },
        }),
        has('inventory.manage')
          ? this.prisma.ingredient.findMany({
              where: { branchId },
              select: { currentStock: true, reorderLevel: true },
            })
          : null,
        has('customers.manage')
          ? this.prisma.customer.count({ where: { branchId } })
          : null,
        has('staff.manage')
          ? this.prisma.user.count({
              where: { isActive: true, branches: { some: { branchId } } },
            })
          : null,
        has('staff.manage')
          ? this.prisma.payrollRun.count({
              where: { branchId, status: { in: ['DRAFT', 'FINALIZED'] } },
            })
          : null,
      ]);

    const owed = pending.reduce((sum, o) => {
      const paid = o.payments.reduce((p, x) => p + Number(x.amount), 0);
      return sum + Math.max(Number(o.totalAmount) - paid, 0);
    }, 0);
    return {
      pendingPayments: {
        count: pending.length,
        balance: Math.round(owed * 100) / 100,
      },
      lowStock:
        lowStock === null
          ? null
          : lowStock.filter(
              (i) => Number(i.currentStock) <= Number(i.reorderLevel),
            ).length,
      customers,
      employees,
      unpaidPayrollRuns: draftPayroll,
    };
  }

  async getPreferences(userId: string): Promise<DashboardPrefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dashboardPrefs: true },
    });
    return sanitizePrefs(user?.dashboardPrefs);
  }

  async setPreferences(userId: string, raw: unknown): Promise<DashboardPrefs> {
    // Layout only. Nothing here can change the figures a widget shows.
    const prefs = sanitizePrefs(raw);
    await this.prisma.user.update({
      where: { id: userId },
      data: { dashboardPrefs: prefs as unknown as Prisma.InputJsonValue },
    });
    return prefs;
  }

  async getTrends(branchId: string, days = 14) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [orders, wasteLogs] = await Promise.all([
      this.prisma.order.findMany({
        where: { branchId, status: 'PAID', billedAt: { gte: since } },
        select: { totalAmount: true, billedAt: true },
      }),
      this.prisma.wasteLog.findMany({
        where: { branchId, createdAt: { gte: since } },
        select: { quantity: true, unitCostAtWaste: true, createdAt: true },
      }),
    ]);

    // Local-calendar-day key, not UTC — this server runs on-site at the
    // restaurant (the whole point of the offline-first/LAN deployment
    // model), so its local timezone is the restaurant's. toISOString()
    // would convert to UTC first, shifting "today" onto "yesterday"'s
    // label for any positive UTC offset (e.g. IST) once local time passes
    // midnight but UTC hasn't yet.
    const dateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const revenueByDay = new Map<string, number>();
    const wasteByDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      revenueByDay.set(key, 0);
      wasteByDay.set(key, 0);
    }

    for (const order of orders) {
      if (!order.billedAt) continue;
      const key = dateKey(order.billedAt);
      if (revenueByDay.has(key)) {
        revenueByDay.set(
          key,
          revenueByDay.get(key)! + Number(order.totalAmount),
        );
      }
    }

    for (const log of wasteLogs) {
      const key = dateKey(log.createdAt);
      if (wasteByDay.has(key)) {
        const cost = Number(log.quantity) * Number(log.unitCostAtWaste);
        wasteByDay.set(key, wasteByDay.get(key)! + cost);
      }
    }

    return {
      revenue: [...revenueByDay.entries()].map(([date, amount]) => ({
        date,
        amount: Math.round(amount * 100) / 100,
      })),
      waste: [...wasteByDay.entries()].map(([date, cost]) => ({
        date,
        cost: Math.round(cost * 100) / 100,
      })),
    };
  }
}
