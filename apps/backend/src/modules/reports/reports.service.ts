import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { permissionSatisfied } from '@nodedr-restaurant/types';
import { BranchTimeService } from '../../common/services/branch-time.service';
import { localDate, localMinuteAndDay, zonedRange } from '../../common/time';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import type { CsvValue } from './csv';

export interface ReportResult {
  key: string;
  title: string;
  columns: string[];
  rows: CsvValue[][];
}

export const REPORT_CATALOG = [
  { key: 'financial-summary', title: 'Financial summary (Sales & Expenses)', group: 'Financial' },
  { key: 'sales-daily', title: 'Daily sales', group: 'Sales' },
  { key: 'sales-weekly', title: 'Weekly sales', group: 'Sales' },
  { key: 'sales-monthly', title: 'Monthly sales', group: 'Sales' },
  { key: 'dine-in-vs-takeaway', title: 'Dine-in vs Takeaway sales', group: 'Sales' },
  { key: 'order-status-summary', title: 'Order status & refunds', group: 'Sales' },
  { key: 'sales-by-item', title: 'Sales by item', group: 'Sales' },
  { key: 'sales-by-category', title: 'Sales by category', group: 'Sales' },
  { key: 'popular-items', title: 'Popular items', group: 'Sales' },
  { key: 'slow-movers', title: 'Slow movers', group: 'Sales' },
  { key: 'payment-methods', title: 'Payment methods', group: 'Sales' },
  { key: 'discounts', title: 'Discounts & coupons', group: 'Sales' },
  { key: 'tax', title: 'Tax (VAT) summary', group: 'Tax' },
  { key: 'peak-hours', title: 'Peak hours', group: 'Analytics' },
  { key: 'food-cost', title: 'Food cost & margins', group: 'Analytics' },
  { key: 'customers', title: 'Top customers', group: 'Customers' },
  { key: 'retention', title: 'New vs returning customers', group: 'Customers' },
  { key: 'staff-sales', title: 'Staff sales', group: 'Staff' },
  { key: 'table-turnover', title: 'Table turnover', group: 'Operations' },
  { key: 'reservations', title: 'Reservations', group: 'Operations' },
  { key: 'delivery', title: 'Deliveries', group: 'Operations' },
  { key: 'waste', title: 'Waste', group: 'Inventory' },
  {
    key: 'inventory-valuation',
    title: 'Inventory valuation',
    group: 'Inventory',
  },
] as const;

// Reports that expose revenue / sales totals. They need the dedicated
// dashboard.sales.view permission on top of reports.access, so granting
// reports.access (e.g. to an inventory manager) never leaks sales figures.
export const SALES_REPORT_KEYS: ReadonlySet<string> = new Set([
  'financial-summary',
  'sales-daily',
  'sales-weekly',
  'sales-monthly',
  'dine-in-vs-takeaway',
  'order-status-summary',
  'sales-by-item',
  'sales-by-category',
  'popular-items',
  'slow-movers',
  'payment-methods',
  'discounts',
  'tax',
  'peak-hours',
  'food-cost',
  'customers',
  'retention',
  'staff-sales',
]);

export function canViewReport(
  permissions: readonly string[],
  key: string,
): boolean {
  return (
    !SALES_REPORT_KEYS.has(key) ||
    permissionSatisfied(permissions, 'dashboard.sales.view')
  );
}

export function assertCanViewReport(
  permissions: readonly string[],
  key: string,
): void {
  if (!canViewReport(permissions, key)) {
    throw new ForbiddenException('Missing permission: dashboard.sales.view');
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BranchTimeService,
    private readonly accounting: AccountingService,
  ) {}

  catalog(permissions: readonly string[]) {
    return REPORT_CATALOG.filter((r) => canViewReport(permissions, r.key));
  }

  async run(
    key: string,
    branchId: string,
    from: string,
    to: string,
  ): Promise<ReportResult> {
    const entry = REPORT_CATALOG.find((r) => r.key === key);
    if (!entry) throw new BadRequestException(`Unknown report "${key}"`);
    for (const d of [from, to]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))
        throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (to < from)
      throw new BadRequestException('"to" cannot be before "from"');
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000)
      throw new BadRequestException('Choose a range of at most one year');

    const tz = await this.time.tzForBranch(branchId);
    const range = zonedRange(from, to, tz);
    const base = { key, title: entry.title };
    const out = (columns: string[], rows: CsvValue[][]) => ({
      ...base,
      columns,
      rows,
    });

    switch (key) {
      case 'financial-summary': {
        const [payments, refunds, discounts, expenses] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { createdAt: range, order: { branchId, status: 'PAID' } },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.refund.aggregate({
            where: { order: { branchId }, createdAt: range },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.order.aggregate({
            where: { branchId, status: 'PAID', billedAt: range },
            _sum: { discountAmount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              branchId,
              spentOn: {
                gte: new Date(`${from}T00:00:00.000Z`),
                lte: new Date(`${to}T00:00:00.000Z`),
              },
            },
            _sum: { amount: true },
            _count: true,
          }),
        ]);

        const grossSales = Number(payments._sum.amount ?? 0);
        const totalRefunds = Number(refunds._sum?.amount ?? 0);
        const totalDiscounts = Number(discounts._sum.discountAmount ?? 0);
        const netSales = Math.max(0, grossSales - totalRefunds);
        const totalExpenses = Number(expenses._sum.amount ?? 0);
        const netLessExpenses = Math.round((netSales - totalExpenses) * 100) / 100;
        const paymentsCount = payments._count ?? 0;
        const refundsCount = refunds._count ?? 0;
        const expensesCount = expenses._count ?? 0;

        return out(
          ['Financial Metric', 'Amount (TK.)', 'Count', 'Accounting Notes'],
          [
            ['Gross Sales', round2(grossSales), paymentsCount, 'Total payment collections received'],
            ['Promotional Discounts', round2(totalDiscounts), '-', 'Authorized menu and bill discounts'],
            ['Customer Refunds', round2(totalRefunds), refundsCount, 'Refunds returned to customers'],
            ['Net Sales', round2(netSales), '-', 'Gross Sales minus Customer Refunds'],
            ['Operating Expenses', round2(totalExpenses), expensesCount, 'Total recorded restaurant expenses (Rent, Salary, Utilities, etc.)'],
            ['Net Sales Less Operating Expenses', round2(netLessExpenses), '-', 'Operating margin before unrecorded overhead / tax depreciation'],
          ],
        );
      }

      case 'sales-daily': {
        const [orders, refunds] = await Promise.all([
          this.prisma.order.findMany({
            where: { branchId, status: 'PAID', billedAt: range },
            select: {
              billedAt: true,
              totalAmount: true,
              taxAmount: true,
              discountAmount: true,
            },
          }),
          this.prisma.refund.findMany({
            where: { order: { branchId }, createdAt: range },
            select: { amount: true, createdAt: true },
          }),
        ]);

        const byDay = new Map<
          string,
          { n: number; gross: number; disc: number; refunds: number; tax: number }
        >();

        for (const o of orders) {
          const d = localDate(o.billedAt!, tz);
          const row = byDay.get(d) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.n++;
          row.gross += Number(o.totalAmount);
          row.disc += Number(o.discountAmount);
          row.tax += Number(o.taxAmount);
          byDay.set(d, row);
        }

        for (const r of refunds) {
          const d = localDate(r.createdAt, tz);
          const row = byDay.get(d) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.refunds += Number(r.amount);
          byDay.set(d, row);
        }

        return out(
          [
            'Date',
            'Orders',
            'Gross Sales',
            'Discounts',
            'Refunds',
            'Net Sales',
            'Tax Included',
          ],
          [...byDay.entries()]
            .sort()
            .map(([d, r]) => [
              d,
              r.n,
              round2(r.gross),
              round2(r.disc),
              round2(r.refunds),
              round2(Math.max(0, r.gross - r.refunds)),
              round2(r.tax),
            ]),
        );
      }

      case 'sales-weekly': {
        const [orders, refunds] = await Promise.all([
          this.prisma.order.findMany({
            where: { branchId, status: 'PAID', billedAt: range },
            select: {
              billedAt: true,
              totalAmount: true,
              taxAmount: true,
              discountAmount: true,
            },
          }),
          this.prisma.refund.findMany({
            where: { order: { branchId }, createdAt: range },
            select: { amount: true, createdAt: true },
          }),
        ]);

        // Helper to format ISO week string
        const toWeekKey = (instant: Date) => {
          const d = new Date(instant);
          const day = d.getDay() || 7;
          d.setDate(d.getDate() + 4 - day);
          const yearStart = new Date(d.getFullYear(), 0, 1);
          const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
          return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        };

        const byWeek = new Map<
          string,
          { n: number; gross: number; disc: number; refunds: number; tax: number }
        >();

        for (const o of orders) {
          const w = toWeekKey(o.billedAt!);
          const row = byWeek.get(w) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.n++;
          row.gross += Number(o.totalAmount);
          row.disc += Number(o.discountAmount);
          row.tax += Number(o.taxAmount);
          byWeek.set(w, row);
        }

        for (const r of refunds) {
          const w = toWeekKey(r.createdAt);
          const row = byWeek.get(w) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.refunds += Number(r.amount);
          byWeek.set(w, row);
        }

        return out(
          [
            'Week',
            'Orders',
            'Gross Sales',
            'Discounts',
            'Refunds',
            'Net Sales',
            'Tax Included',
          ],
          [...byWeek.entries()]
            .sort()
            .map(([w, r]) => [
              w,
              r.n,
              round2(r.gross),
              round2(r.disc),
              round2(r.refunds),
              round2(Math.max(0, r.gross - r.refunds)),
              round2(r.tax),
            ]),
        );
      }

      case 'sales-monthly': {
        const [orders, refunds] = await Promise.all([
          this.prisma.order.findMany({
            where: { branchId, status: 'PAID', billedAt: range },
            select: {
              billedAt: true,
              totalAmount: true,
              taxAmount: true,
              discountAmount: true,
            },
          }),
          this.prisma.refund.findMany({
            where: { order: { branchId }, createdAt: range },
            select: { amount: true, createdAt: true },
          }),
        ]);

        const byMonth = new Map<
          string,
          { n: number; gross: number; disc: number; refunds: number; tax: number }
        >();

        for (const o of orders) {
          const m = localDate(o.billedAt!, tz).slice(0, 7);
          const row = byMonth.get(m) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.n++;
          row.gross += Number(o.totalAmount);
          row.disc += Number(o.discountAmount);
          row.tax += Number(o.taxAmount);
          byMonth.set(m, row);
        }

        for (const r of refunds) {
          const m = localDate(r.createdAt, tz).slice(0, 7);
          const row = byMonth.get(m) ?? { n: 0, gross: 0, disc: 0, refunds: 0, tax: 0 };
          row.refunds += Number(r.amount);
          byMonth.set(m, row);
        }

        return out(
          [
            'Month',
            'Orders',
            'Gross Sales',
            'Discounts',
            'Refunds',
            'Net Sales',
            'Tax Included',
          ],
          [...byMonth.entries()]
            .sort()
            .map(([m, r]) => [
              m,
              r.n,
              round2(r.gross),
              round2(r.disc),
              round2(r.refunds),
              round2(Math.max(0, r.gross - r.refunds)),
              round2(r.tax),
            ]),
        );
      }

      case 'dine-in-vs-takeaway': {
        const orders = await this.prisma.order.findMany({
          where: { branchId, status: 'PAID', billedAt: range },
          select: { type: true, totalAmount: true },
        });
        const byType = new Map<string, { count: number; total: number }>();
        let totalRevenue = 0;
        for (const o of orders) {
          const typeName =
            o.type === 'DINE_IN' ? 'Dine-in' : o.type === 'TAKEAWAY' ? 'Takeaway' : 'Delivery';
          const r = byType.get(typeName) ?? { count: 0, total: 0 };
          r.count++;
          r.total += Number(o.totalAmount);
          totalRevenue += Number(o.totalAmount);
          byType.set(typeName, r);
        }
        return out(
          ['Dining Type', 'Orders', 'Gross Sales', 'Avg Order Value', 'Share %'],
          [...byType.entries()].map(([type, r]) => [
            type,
            r.count,
            round2(r.total),
            r.count ? round2(r.total / r.count) : 0,
            totalRevenue ? round2((r.total / totalRevenue) * 100) : 0,
          ]),
        );
      }

      case 'order-status-summary': {
        const [orders, refunds] = await Promise.all([
          this.prisma.order.findMany({
            where: { branchId, createdAt: range },
            select: { id: true, status: true, totalAmount: true, cancelReason: true },
          }),
          this.prisma.refund.aggregate({
            where: { order: { branchId }, createdAt: range },
            _sum: { amount: true },
            _count: true,
          }),
        ]);

        const completed = orders.filter((o) => o.status === 'PAID');
        const cancelled = orders.filter((o) => o.status === 'CANCELLED');
        const open = orders.filter((o) => o.status === 'OPEN' || o.status === 'BILLED');

        const completedTotal = completed.reduce((s, o) => s + Number(o.totalAmount), 0);
        const cancelledTotal = cancelled.reduce((s, o) => s + Number(o.totalAmount), 0);
        const openTotal = open.reduce((s, o) => s + Number(o.totalAmount), 0);
        const refundTotal = Number(refunds._sum?.amount ?? 0);

        return out(
          [
            'Order Status',
            'Orders',
            'Gross Amount',
            'Refunds Issued',
            'Net Settled Amount',
            'Operational Notes',
          ],
          [
            [
              'Completed & Paid',
              completed.length,
              round2(completedTotal),
              round2(refundTotal),
              round2(Math.max(0, completedTotal - refundTotal)),
              'Settled and paid customer orders',
            ],
            [
              'Cancelled Orders',
              cancelled.length,
              round2(cancelledTotal),
              0,
              0,
              'Orders cancelled before or during prep',
            ],
            [
              'Active / In-Progress',
              open.length,
              round2(openTotal),
              0,
              round2(openTotal),
              'Currently active orders on tables / in prep',
            ],
          ],
        );
      }

      case 'sales-by-item':
      case 'popular-items':
      case 'slow-movers': {
        const [items, menu] = await Promise.all([
          this.prisma.orderItem.groupBy({
            by: ['menuItemId', 'nameSnapshot'],
            where: {
              order: { branchId, status: 'PAID', billedAt: range },
              status: { not: 'CANCELLED' },
            },
            _sum: { quantity: true, lineTotal: true },
          }),
          this.prisma.menuItem.findMany({
            where: { branchId, isActive: true },
            select: { id: true, name: true },
          }),
        ]);
        const sold = new Map(items.map((i) => [i.menuItemId, i]));
        let rows: { name: string; qty: number; revenue: number }[] = items.map(
          (i) => ({
            name: i.nameSnapshot,
            qty: i._sum.quantity ?? 0,
            revenue: round2(Number(i._sum.lineTotal ?? 0)),
          }),
        );
        if (key === 'slow-movers') {
          rows = menu.map((m) => ({
            name: m.name,
            qty: sold.get(m.id)?._sum.quantity ?? 0,
            revenue: round2(Number(sold.get(m.id)?._sum.lineTotal ?? 0)),
          }));
          rows.sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name));
        } else {
          rows.sort((a, b) =>
            key === 'sales-by-item' ? b.revenue - a.revenue : b.qty - a.qty,
          );
        }
        if (key !== 'sales-by-item') rows = rows.slice(0, 25);
        return out(
          ['Item', 'Quantity', 'Revenue'],
          rows.map((r) => [r.name, r.qty, r.revenue]),
        );
      }

      case 'sales-by-category': {
        const lines = await this.prisma.orderItem.findMany({
          where: {
            order: { branchId, status: 'PAID', billedAt: range },
            status: { not: 'CANCELLED' },
          },
          select: {
            quantity: true,
            lineTotal: true,
            menuItem: { select: { category: { select: { name: true } } } },
          },
        });
        const by = new Map<string, { qty: number; revenue: number }>();
        for (const l of lines) {
          const name = l.menuItem.category.name;
          const r = by.get(name) ?? { qty: 0, revenue: 0 };
          r.qty += l.quantity;
          r.revenue += Number(l.lineTotal);
          by.set(name, r);
        }
        return out(
          ['Category', 'Quantity', 'Revenue'],
          [...by.entries()]
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([n, r]) => [n, r.qty, round2(r.revenue)]),
        );
      }

      case 'payment-methods': {
        const g = await this.prisma.payment.groupBy({
          by: ['method'],
          where: { createdAt: range, order: { branchId, status: 'PAID' } },
          _count: { _all: true },
          _sum: { amount: true },
        });
        return out(
          ['Method', 'Payments', 'Amount'],
          g.map((r) => [
            r.method,
            r._count._all,
            round2(Number(r._sum.amount ?? 0)),
          ]),
        );
      }

      case 'discounts': {
        const orders = await this.prisma.order.findMany({
          where: {
            branchId,
            status: 'PAID',
            billedAt: range,
            discountAmount: { gt: 0 },
          },
          select: {
            orderNumber: true,
            billedAt: true,
            discountAmount: true,
            couponCode: true,
            promotionName: true,
          },
          orderBy: { billedAt: 'asc' },
        });
        return out(
          ['Order', 'Date', 'Discount', 'Coupon', 'Happy hour'],
          orders.map((o) => [
            o.orderNumber,
            localDate(o.billedAt!, tz),
            round2(Number(o.discountAmount)),
            o.couponCode,
            o.promotionName,
          ]),
        );
      }

      case 'tax': {
        const g = await this.accounting.gstReport(branchId, from, to);
        return out(
          ['Rate %', 'Taxable value', 'Tax', 'Total'],
          [
            ...g.rows.map((r) => [
              r.ratePercent,
              r.taxableValue,
              r.tax,
              r.total,
            ]),
            [
              'Total',
              g.totalTaxable,
              g.totalTax,
              round2(g.totalTaxable + g.totalTax),
            ],
          ],
        );
      }

      case 'peak-hours': {
        const orders = await this.prisma.order.findMany({
          where: { branchId, status: 'PAID', billedAt: range },
          select: { createdAt: true, totalAmount: true },
        });
        const cell = new Map<string, { n: number; sales: number }>();
        for (const o of orders) {
          const { day, minute } = localMinuteAndDay(o.createdAt, tz);
          const k = `${day}-${Math.floor(minute / 60)}`;
          const c = cell.get(k) ?? { n: 0, sales: 0 };
          c.n++;
          c.sales += Number(o.totalAmount);
          cell.set(k, c);
        }
        const rows = [...cell.entries()]
          .map(([k, c]) => {
            const [d, h] = k.split('-').map(Number);
            return { d, h, ...c };
          })
          .sort((a, b) => b.n - a.n || a.d - b.d || a.h - b.h);
        return out(
          ['Day', 'Hour', 'Orders', 'Sales'],
          rows.map((r) => [
            DAYS[r.d],
            `${String(r.h).padStart(2, '0')}:00`,
            r.n,
            round2(r.sales),
          ]),
        );
      }

      case 'food-cost': {
        const [items, sold] = await Promise.all([
          this.prisma.menuItem.findMany({
            where: { branchId, isActive: true },
            select: {
              id: true,
              name: true,
              price: true,
              recipeLines: {
                select: {
                  quantity: true,
                  ingredient: { select: { costPerUnit: true } },
                },
              },
            },
          }),
          this.prisma.orderItem.groupBy({
            by: ['menuItemId'],
            where: {
              order: { branchId, status: 'PAID', billedAt: range },
              status: { not: 'CANCELLED' },
            },
            _sum: { quantity: true },
          }),
        ]);
        const qty = new Map(
          sold.map((s) => [s.menuItemId, s._sum.quantity ?? 0]),
        );
        const rows = items
          .filter((i) => i.recipeLines.length > 0)
          .map((i) => {
            const cost = i.recipeLines.reduce(
              (s, r) =>
                s + Number(r.quantity) * Number(r.ingredient.costPerUnit),
              0,
            );
            const price = Number(i.price);
            const units = qty.get(i.id) ?? 0;
            return [
              i.name,
              round2(price),
              round2(cost),
              round2(price - cost),
              price > 0 ? round2(((price - cost) / price) * 100) : 0,
              units,
              round2((price - cost) * units),
            ];
          })
          .sort((a, b) => Number(b[6]) - Number(a[6]));
        return out(
          [
            'Item',
            'Price',
            'Recipe cost',
            'Margin',
            'Margin %',
            'Units sold',
            'Total margin',
          ],
          rows,
        );
      }

      case 'customers': {
        const g = await this.prisma.order.groupBy({
          by: ['customerId'],
          where: {
            branchId,
            status: 'PAID',
            billedAt: range,
            customerId: { not: null },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 50,
        });
        const people = await this.prisma.customer.findMany({
          where: { id: { in: g.map((r) => r.customerId!) } },
          select: { id: true, name: true, phone: true, loyaltyPoints: true },
        });
        const byId = new Map(people.map((p) => [p.id, p]));
        return out(
          ['Customer', 'Phone', 'Orders', 'Spend', 'Loyalty points'],
          g.map((r) => {
            const p = byId.get(r.customerId!);
            return [
              p?.name ?? '(no name)',
              p?.phone,
              r._count._all,
              round2(Number(r._sum.totalAmount ?? 0)),
              p?.loyaltyPoints ?? 0,
            ];
          }),
        );
      }

      case 'retention': {
        const inRange = await this.prisma.order.findMany({
          where: {
            branchId,
            status: 'PAID',
            billedAt: range,
            customerId: { not: null },
          },
          select: { customerId: true, billedAt: true },
        });
        const ids = [...new Set(inRange.map((o) => o.customerId!))];
        const earlier = await this.prisma.order.findMany({
          where: {
            branchId,
            status: 'PAID',
            billedAt: { lt: range.gte },
            customerId: { in: ids },
          },
          select: { customerId: true },
          distinct: ['customerId'],
        });
        const returning = new Set(earlier.map((o) => o.customerId!));
        const byMonth = new Map<string, { n: Set<string>; r: Set<string> }>();
        for (const o of inRange) {
          const m = localDate(o.billedAt!, tz).slice(0, 7);
          const row = byMonth.get(m) ?? {
            n: new Set<string>(),
            r: new Set<string>(),
          };
          (returning.has(o.customerId!) ? row.r : row.n).add(o.customerId!);
          byMonth.set(m, row);
        }
        return out(
          ['Month', 'New customers', 'Returning customers', 'Returning %'],
          [...byMonth.entries()].sort().map(([m, r]) => {
            const total = r.n.size + r.r.size;
            return [
              m,
              r.n.size,
              r.r.size,
              total ? round2((r.r.size / total) * 100) : 0,
            ];
          }),
        );
      }

      case 'staff-sales': {
        const g = await this.prisma.order.groupBy({
          by: ['createdById'],
          where: { branchId, status: 'PAID', billedAt: range },
          _count: { _all: true },
          _sum: { totalAmount: true, tipAmount: true },
        });
        const users = await this.prisma.user.findMany({
          where: { id: { in: g.map((r) => r.createdById) } },
          select: { id: true, name: true },
        });
        const names = new Map(users.map((u) => [u.id, u.name]));
        return out(
          ['Staff', 'Orders', 'Sales', 'Tips'],
          g
            .sort(
              (a, b) =>
                Number(b._sum.totalAmount ?? 0) -
                Number(a._sum.totalAmount ?? 0),
            )
            .map((r) => [
              names.get(r.createdById) ?? 'Unknown',
              r._count._all,
              round2(Number(r._sum.totalAmount ?? 0)),
              round2(Number(r._sum.tipAmount ?? 0)),
            ]),
        );
      }

      case 'table-turnover': {
        const orders = await this.prisma.order.findMany({
          where: {
            branchId,
            status: 'PAID',
            billedAt: range,
            tableId: { not: null },
          },
          select: {
            createdAt: true,
            billedAt: true,
            table: { select: { number: true, name: true } },
          },
        });
        const by = new Map<string, { n: number; mins: number }>();
        for (const o of orders) {
          const name = o.table?.name ?? `Table ${o.table?.number}`;
          const r = by.get(name) ?? { n: 0, mins: 0 };
          r.n++;
          r.mins += (o.billedAt!.getTime() - o.createdAt.getTime()) / 60_000;
          by.set(name, r);
        }
        return out(
          ['Table', 'Orders', 'Avg minutes per order'],
          [...by.entries()]
            .sort((a, b) => b[1].n - a[1].n)
            .map(([n, r]) => [n, r.n, round2(r.mins / r.n)]),
        );
      }

      case 'reservations': {
        const g = await this.prisma.reservation.groupBy({
          by: ['status'],
          where: { branchId, reservedAt: range },
          _count: { _all: true },
          _sum: { guestCount: true },
        });
        return out(
          ['Status', 'Reservations', 'Guests'],
          g.map((r) => [r.status, r._count._all, r._sum.guestCount ?? 0]),
        );
      }

      case 'delivery': {
        const orders = await this.prisma.order.findMany({
          where: {
            branchId,
            type: 'DELIVERY',
            createdAt: range,
            deliveryStatus: { not: null },
          },
          select: {
            deliveryStatus: true,
            deliveryFee: true,
            createdAt: true,
            deliveredAt: true,
          },
        });
        const by = new Map<
          string,
          { n: number; fee: number; mins: number; timed: number }
        >();
        for (const o of orders) {
          const k = o.deliveryStatus!;
          const r = by.get(k) ?? { n: 0, fee: 0, mins: 0, timed: 0 };
          r.n++;
          r.fee += Number(o.deliveryFee);
          if (o.deliveredAt) {
            r.mins +=
              (o.deliveredAt.getTime() - o.createdAt.getTime()) / 60_000;
            r.timed++;
          }
          by.set(k, r);
        }
        return out(
          ['Status', 'Orders', 'Delivery fees', 'Avg minutes to deliver'],
          [...by.entries()].map(([k, r]) => [
            k,
            r.n,
            round2(r.fee),
            r.timed ? round2(r.mins / r.timed) : null,
          ]),
        );
      }

      case 'waste': {
        const logs = await this.prisma.wasteLog.findMany({
          where: { branchId, createdAt: range },
          select: { reason: true, quantity: true, unitCostAtWaste: true },
        });
        const by = new Map<string, { n: number; cost: number }>();
        for (const l of logs) {
          const r = by.get(l.reason) ?? { n: 0, cost: 0 };
          r.n++;
          r.cost += Number(l.quantity) * Number(l.unitCostAtWaste);
          by.set(l.reason, r);
        }
        return out(
          ['Reason', 'Entries', 'Cost'],
          [...by.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([k, r]) => [k, r.n, round2(r.cost)]),
        );
      }

      default: {
        // inventory-valuation (a point-in-time report; the range is ignored)
        const ing = await this.prisma.ingredient.findMany({
          where: { branchId },
          select: {
            name: true,
            unit: true,
            currentStock: true,
            costPerUnit: true,
          },
          orderBy: { name: 'asc' },
        });
        const rows = ing.map((i) => [
          i.name,
          i.unit,
          Number(i.currentStock),
          round2(Number(i.costPerUnit)),
          round2(Number(i.currentStock) * Number(i.costPerUnit)),
        ]);
        return out(
          ['Ingredient', 'Unit', 'In stock', 'Cost per unit', 'Value'],
          [
            ...rows,
            [
              'Total',
              '',
              '',
              '',
              round2(rows.reduce((s, r) => s + Number(r[4]), 0)),
            ],
          ],
        );
      }
    }
  }
}
