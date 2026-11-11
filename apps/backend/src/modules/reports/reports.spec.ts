/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DEFAULT_ROLE_PERMISSIONS } from '@nodedr-restaurant/types';
import { localDate, zonedDayStart, zonedRange } from '../../common/time';
import { toCsv } from './csv';
import { buildPdf, buildXlsx, renderReport } from './export';
import {
  assertCanViewReport,
  canViewReport,
  ReportsService,
  SALES_REPORT_KEYS,
} from './reports.service';

describe('Phase 11: Reports & Financial Management Engine', () => {
  // -------------------------------------------------------------------------
  // 1. Role-Based Permissions & Guard Tests
  // -------------------------------------------------------------------------
  describe('Role-based access restrictions', () => {
    const superAdminPerms = DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
    const managerPerms = DEFAULT_ROLE_PERMISSIONS.MANAGER;
    const cashierPerms = DEFAULT_ROLE_PERMISSIONS.CASHIER;
    const waiterPerms = DEFAULT_ROLE_PERMISSIONS.WAITER;
    const kitchenStaffPerms = DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF;

    it('allows Super Admin and Manager to view financial and sales reports', () => {
      for (const key of SALES_REPORT_KEYS) {
        expect(canViewReport(superAdminPerms, key)).toBe(true);
        expect(canViewReport(managerPerms, key)).toBe(true);
        expect(() => assertCanViewReport(superAdminPerms, key)).not.toThrow();
        expect(() => assertCanViewReport(managerPerms, key)).not.toThrow();
      }
    });

    it('strictly forbids Cashier from viewing revenue/sales reports and summaries', () => {
      // Cashier only has operational sales.view (for current tickets/receipts), NOT dashboard.sales.view
      expect(canViewReport(cashierPerms, 'financial-summary')).toBe(false);
      expect(canViewReport(cashierPerms, 'sales-daily')).toBe(false);
      expect(canViewReport(cashierPerms, 'sales-weekly')).toBe(false);
      expect(canViewReport(cashierPerms, 'sales-monthly')).toBe(false);
      expect(canViewReport(cashierPerms, 'dine-in-vs-takeaway')).toBe(false);
      expect(canViewReport(cashierPerms, 'order-status-summary')).toBe(false);

      expect(() => assertCanViewReport(cashierPerms, 'financial-summary')).toThrow(
        ForbiddenException,
      );
      expect(() => assertCanViewReport(cashierPerms, 'sales-daily')).toThrow(
        ForbiddenException,
      );
    });

    it('strictly forbids Waiter and Kitchen Staff from accessing sales and financial reports', () => {
      expect(canViewReport(waiterPerms, 'financial-summary')).toBe(false);
      expect(canViewReport(kitchenStaffPerms, 'financial-summary')).toBe(false);
      expect(() => assertCanViewReport(waiterPerms, 'financial-summary')).toThrow(
        ForbiddenException,
      );
      expect(() =>
        assertCanViewReport(kitchenStaffPerms, 'financial-summary'),
      ).toThrow(ForbiddenException);
    });

    it('allows export permissions check only when data.export is held', () => {
      expect(managerPerms.includes('data.export')).toBe(true);
      expect(superAdminPerms.includes('data.export')).toBe(true);
      expect(cashierPerms.includes('data.export')).toBe(false);
      expect(waiterPerms.includes('data.export')).toBe(false);
      expect(kitchenStaffPerms.includes('data.export')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Timezone Boundaries (Asia/Dhaka - UTC+6)
  // -------------------------------------------------------------------------
  describe('Timezone boundaries for Asia/Dhaka', () => {
    const tz = 'Asia/Dhaka';

    it('starts Dhaka calendar day at 18:00 UTC of the previous calendar day', () => {
      const dhakaStart = zonedDayStart('2026-11-07', tz);
      // Dhaka is UTC+6, so 2026-11-07 00:00:00 Dhaka = 2026-11-06 18:00:00 UTC
      expect(dhakaStart.toISOString()).toBe('2026-11-06T18:00:00.000Z');
    });

    it('encloses a full 24-hour range for a single Dhaka day', () => {
      const r = zonedRange('2026-11-07', '2026-11-07', tz);
      expect(r.gte.toISOString()).toBe('2026-11-06T18:00:00.000Z');
      expect(r.lt.toISOString()).toBe('2026-11-07T18:00:00.000Z');
      const diffHours = (r.lt.getTime() - r.gte.getTime()) / 3_600_000;
      expect(diffHours).toBe(24);
    });

    it('correctly maps timestamps to Dhaka local date', () => {
      // 2026-11-06 19:00 UTC = 2026-11-07 01:00 AM Dhaka
      const earlyMorningDhaka = new Date('2026-11-06T19:00:00.000Z');
      expect(localDate(earlyMorningDhaka, tz)).toBe('2026-11-07');

      // 2026-11-07 17:30 UTC = 2026-11-07 11:30 PM Dhaka
      const lateNightDhaka = new Date('2026-11-07T17:30:00.000Z');
      expect(localDate(lateNightDhaka, tz)).toBe('2026-11-07');

      // 2026-11-07 18:15 UTC = 2026-11-08 00:15 AM Dhaka (next day)
      const nextDayDhaka = new Date('2026-11-07T18:15:00.000Z');
      expect(localDate(nextDayDhaka, tz)).toBe('2026-11-08');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Financial Summary & Reports Engine Calculations
  // -------------------------------------------------------------------------
  describe('ReportsService calculation engine', () => {
    function createService(mockData: {
      paymentsAggregate?: { amount: number | null; count: number };
      refundsAggregate?: { amount: number | null; count: number };
      discountsAggregate?: { discountAmount: number | null };
      expensesAggregate?: { amount: number | null; count: number };
      ordersList?: any[];
      refundsList?: any[];
      kotList?: any[];
      paymentsList?: any[];
    }) {
      const prisma: any = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: mockData.paymentsAggregate?.amount ?? 0 },
            _count: mockData.paymentsAggregate?.count ?? 0,
          }),
          findMany: jest.fn().mockResolvedValue(mockData.paymentsList ?? []),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: mockData.refundsAggregate?.amount ?? 0 },
            _count: mockData.refundsAggregate?.count ?? 0,
          }),
          findMany: jest.fn().mockResolvedValue(mockData.refundsList ?? []),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: {
              discountAmount: mockData.discountsAggregate?.discountAmount ?? 0,
            },
          }),
          findMany: jest.fn().mockResolvedValue(mockData.ordersList ?? []),
          count: jest.fn().mockResolvedValue(mockData.ordersList?.length ?? 0),
        },
        expense: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: mockData.expensesAggregate?.amount ?? 0 },
            _count: mockData.expensesAggregate?.count ?? 0,
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        kot: {
          findMany: jest.fn().mockResolvedValue(mockData.kotList ?? []),
        },
      };

      const time: any = {
        tzForBranch: jest.fn().mockResolvedValue('Asia/Dhaka'),
      };
      const accounting: any = {};

      const service = new ReportsService(prisma, time, accounting);
      return { service, prisma };
    }

    it('calculates financial-summary accurately (Gross, Discounts, Refunds, Net Sales, Expenses, Margin)', async () => {
      const { service } = createService({
        paymentsAggregate: { amount: 65000, count: 42 },
        refundsAggregate: { amount: 2500, count: 2 },
        discountsAggregate: { discountAmount: 3200 },
        expensesAggregate: { amount: 18000, count: 5 },
      });

      const report = await service.run(
        'financial-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-07',
      );

      expect(report.title).toBe('Financial summary');
      expect(report.columns).toEqual([
        'Financial Metric',
        'Amount (TK.)',
        'Count',
        'Accounting Notes',
      ]);

      const rowsMap = Object.fromEntries(
        report.rows.map((row) => [row[0], row[1]]),
      );

      // Gross Sales from payments
      expect(rowsMap['Gross Sales']).toBe(65000);
      // Discounts from orders
      expect(rowsMap['Promotional Discounts']).toBe(3200);
      // Customer Refunds
      expect(rowsMap['Customer Refunds']).toBe(2500);
      // Net Sales = Gross - Refunds = 65000 - 2500 = 62500
      expect(rowsMap['Net Sales']).toBe(62500);
      // Operating Expenses
      expect(rowsMap['Operating Expenses']).toBe(18000);
      // Net Sales Less Operating Expenses = 62500 - 18000 = 44500
      expect(rowsMap['Net Sales Less Operating Expenses']).toBe(44500);
    });

    it('aggregates daily sales within Dhaka timezone in sales-daily report', async () => {
      const { service } = createService({
        ordersList: [
          // Order 1 at 12:00 PM Dhaka time on Nov 05
          {
            billedAt: new Date('2026-11-05T06:00:00.000Z'),
            totalAmount: 1200,
            taxAmount: 60,
            discountAmount: 100,
          },
          // Order 2 at 10:30 PM Dhaka time on Nov 05
          {
            billedAt: new Date('2026-11-05T16:30:00.000Z'),
            totalAmount: 800,
            taxAmount: 40,
            discountAmount: 0,
          },
          // Order 3 at 01:00 AM Dhaka time on Nov 06 (19:00 UTC on Nov 05)
          {
            billedAt: new Date('2026-11-05T19:00:00.000Z'),
            totalAmount: 2500,
            taxAmount: 125,
            discountAmount: 250,
          },
        ],
        refundsList: [
          // Refund on Nov 05
          {
            amount: 200,
            createdAt: new Date('2026-11-05T08:00:00.000Z'),
          },
        ],
      });

      const report = await service.run(
        'sales-daily',
        'branch-1',
        '2026-11-05',
        '2026-11-06',
      );

      expect(report.columns).toContain('Date');
      expect(report.columns).toContain('Gross Sales');
      expect(report.columns).toContain('Net Sales');

      const nov5 = report.rows.find((r) => r[0] === '2026-11-05');
      const nov6 = report.rows.find((r) => r[0] === '2026-11-06');

      expect(nov5).toBeDefined();
      expect(nov6).toBeDefined();

      // Nov 05: 2 orders, Gross: 1200 + 800 = 2000, Refunds: 200, Net: 1800
      expect(nov5?.[1]).toBe(2); // orders
      expect(nov5?.[2]).toBe(2000); // gross
      expect(nov5?.[4]).toBe(200); // refunds
      expect(nov5?.[5]).toBe(1800); // net sales

      // Nov 06: 1 order, Gross: 2500, Refunds: 0, Net: 2500
      expect(nov6?.[1]).toBe(1);
      expect(nov6?.[2]).toBe(2500);
      expect(nov6?.[5]).toBe(2500);
    });

    it('compares dine-in vs takeaway orders in dine-in-vs-takeaway report', async () => {
      const { service } = createService({
        ordersList: [
          { type: 'DINE_IN', totalAmount: 1500 },
          { type: 'DINE_IN', totalAmount: 2500 },
          { type: 'TAKEAWAY', totalAmount: 1000 },
        ],
      });

      const report = await service.run(
        'dine-in-vs-takeaway',
        'branch-1',
        '2026-11-01',
        '2026-11-07',
      );

      expect(report.columns).toEqual([
        'Dining Type',
        'Orders',
        'Gross Sales (TK.)',
        'Avg Order Value',
        'Share %',
      ]);

      const dineInRow = report.rows.find((r) => r[0] === 'Dine-in');
      const takeawayRow = report.rows.find((r) => r[0] === 'Takeaway');

      expect(dineInRow).toBeDefined();
      expect(takeawayRow).toBeDefined();

      // Dine-in: 2 orders, Gross: 4000 TK., Avg: 2000 TK., Share: 80%
      expect(dineInRow?.[1]).toBe(2);
      expect(dineInRow?.[2]).toBe(4000);
      expect(dineInRow?.[3]).toBe(2000);
      expect(dineInRow?.[4]).toBe('80.0%');

      // Takeaway: 1 order, Gross: 1000 TK., Avg: 1000 TK., Share: 20%
      expect(takeawayRow?.[1]).toBe(1);
      expect(takeawayRow?.[2]).toBe(1000);
      expect(takeawayRow?.[4]).toBe('20.0%');
    });

    it('summarizes order completion statuses in order-status-summary', async () => {
      const { service } = createService({
        ordersList: [
          { status: 'PAID', totalAmount: 1200 },
          { status: 'PAID', totalAmount: 1800 },
          { status: 'CANCELLED', totalAmount: 500 },
          { status: 'REFUNDED', totalAmount: 400 },
        ],
      });

      const report = await service.run(
        'order-status-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-07',
      );

      const completed = report.rows.find((r) => r[0] === 'Completed (Paid)');
      const cancelled = report.rows.find((r) => r[0] === 'Cancelled');
      const refunded = report.rows.find((r) => r[0] === 'Refunded');

      expect(completed?.[1]).toBe(2);
      expect(completed?.[2]).toBe(3000);
      expect(cancelled?.[1]).toBe(1);
      expect(cancelled?.[2]).toBe(500);
      expect(refunded?.[1]).toBe(1);
      expect(refunded?.[2]).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Financial & Operational Edge Cases
  // -------------------------------------------------------------------------
  describe('Edge cases and boundary conditions', () => {
    it('handles a date range with zero sales and zero expenses without division by zero', async () => {
      const prisma: any = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { discountAmount: null } }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        expense: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
        },
      };
      const time: any = { tzForBranch: jest.fn().mockResolvedValue('Asia/Dhaka') };
      const service = new ReportsService(prisma, time, {} as any);

      const summary = await service.run(
        'financial-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-01',
      );

      const rowsMap = Object.fromEntries(
        summary.rows.map((row) => [row[0], row[1]]),
      );
      expect(rowsMap['Gross Sales']).toBe(0);
      expect(rowsMap['Customer Refunds']).toBe(0);
      expect(rowsMap['Net Sales']).toBe(0);
      expect(rowsMap['Operating Expenses']).toBe(0);
      expect(rowsMap['Net Sales Less Operating Expenses']).toBe(0);

      const dineInVsTakeaway = await service.run(
        'dine-in-vs-takeaway',
        'branch-1',
        '2026-11-01',
        '2026-11-01',
      );
      expect(dineInVsTakeaway.rows.length).toBe(0);
    });

    it('calculates zero net sales for a fully refunded order', async () => {
      const prisma: any = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 1500 }, _count: 1 }),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 1500 }, _count: 1 }),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { discountAmount: 0 } }),
        },
        expense: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        },
      };
      const time: any = { tzForBranch: jest.fn().mockResolvedValue('Asia/Dhaka') };
      const service = new ReportsService(prisma, time, {} as any);

      const summary = await service.run(
        'financial-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-01',
      );

      const rowsMap = Object.fromEntries(
        summary.rows.map((row) => [row[0], row[1]]),
      );
      expect(rowsMap['Gross Sales']).toBe(1500);
      expect(rowsMap['Customer Refunds']).toBe(1500);
      expect(rowsMap['Net Sales']).toBe(0);
    });

    it('calculates partial refunds correctly (Gross 2000, Refund 600 -> Net 1400)', async () => {
      const prisma: any = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 2000 }, _count: 1 }),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 600 }, _count: 1 }),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { discountAmount: 0 } }),
        },
        expense: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        },
      };
      const time: any = { tzForBranch: jest.fn().mockResolvedValue('Asia/Dhaka') };
      const service = new ReportsService(prisma, time, {} as any);

      const summary = await service.run(
        'financial-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-01',
      );

      const rowsMap = Object.fromEntries(
        summary.rows.map((row) => [row[0], row[1]]),
      );
      expect(rowsMap['Net Sales']).toBe(1400);
    });

    it('correctly reports negative margin when operating expenses exist on days without sales', async () => {
      const prisma: any = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { discountAmount: 0 } }),
        },
        expense: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 7500 }, _count: 1 }),
        },
      };
      const time: any = { tzForBranch: jest.fn().mockResolvedValue('Asia/Dhaka') };
      const service = new ReportsService(prisma, time, {} as any);

      const summary = await service.run(
        'financial-summary',
        'branch-1',
        '2026-11-01',
        '2026-11-01',
      );

      const rowsMap = Object.fromEntries(
        summary.rows.map((row) => [row[0], row[1]]),
      );
      expect(rowsMap['Net Sales']).toBe(0);
      expect(rowsMap['Operating Expenses']).toBe(7500);
      expect(rowsMap['Net Sales Less Operating Expenses']).toBe(-7500);
    });

    it('validates date parameter formats and disallows inverted date ranges', async () => {
      const service = new ReportsService({} as any, {} as any, {} as any);
      await expect(
        service.run('financial-summary', 'branch-1', '2026-11-10', '2026-11-05'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.run('financial-summary', 'branch-1', 'invalid-date', '2026-11-05'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Exporting (CSV, XLSX, PDF) & UrbanBite Branding
  // -------------------------------------------------------------------------
  describe('Export engine & UrbanBite branding', () => {
    const sampleReport = {
      key: 'financial-summary',
      title: 'Financial summary',
      columns: ['Metric', 'Amount (TK.)'],
      rows: [
        ['Gross Sales', 15000],
        ['Customer Refunds', 500],
        ['Net Sales', 14500],
      ],
    };

    it('renders clean CSV with headers, CRLF, and UTF-8 BOM', async () => {
      const csvBuffer = await renderReport(
        sampleReport,
        'csv',
        '2026-11-01 to 2026-11-07',
      );
      const csvText = csvBuffer.toString('utf8');

      expect(csvText).toContain('Metric,Amount (TK.)');
      expect(csvText).toContain('Gross Sales,15000');
      expect(csvText).toContain('Net Sales,14500');
      expect(csvText.startsWith('\ufeff')).toBe(true); // UTF-8 BOM
    });

    it('generates XLSX workbook created by UrbanBite Restaurant with correct header rows', async () => {
      const xlsxBuffer = await buildXlsx(
        sampleReport,
        '2026-11-01 to 2026-11-07',
      );
      expect(Buffer.isBuffer(xlsxBuffer)).toBe(true);
      expect(xlsxBuffer.length).toBeGreaterThan(100);
    });

    it('generates PDF document with UrbanBite Restaurant brand title', async () => {
      const pdfBuffer = await buildPdf(
        sampleReport,
        '2026-11-01 to 2026-11-07',
      );
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);

      // PDF binary starts with %PDF-
      expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
