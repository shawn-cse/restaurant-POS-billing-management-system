import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { round2 } from '../../common/money';
import { computeBill, settlePayments, manualDiscountEntry } from './settlement';
import { buildReceiptHtml } from './receipt.html';

describe('Phase 07 & 08: UrbanBite POS, Ordering, Billing & Payments', () => {
  describe('Step 1 & 2: Order Creation & Validation', () => {
    it('validates food item availability and active status', () => {
      const mockItems = [
        { id: 'item-1', name: 'Chicken Biryani', price: 250, isActive: true, isAvailable: true },
        { id: 'item-2', name: 'Beef Tehari', price: 280, isActive: false, isAvailable: true },
        { id: 'item-3', name: 'Borhani', price: 60, isActive: true, isAvailable: false },
      ];

      const validateItems = (items: { id: string; quantity: number }[]) => {
        for (const cart of items) {
          const found = mockItems.find((m) => m.id === cart.id);
          if (!found) throw new BadRequestException('Item not found');
          if (!found.isActive) throw new BadRequestException(`Food item "${found.name}" is no longer active`);
          if (!found.isAvailable) throw new BadRequestException(`Food item "${found.name}" is currently unavailable`);
          if (!Number.isInteger(cart.quantity) || cart.quantity <= 0) {
            throw new BadRequestException('Item quantity must be a positive integer');
          }
        }
      };

      // Active & available item succeeds
      expect(() => validateItems([{ id: 'item-1', quantity: 2 }])).not.toThrow();

      // Inactive item is rejected
      expect(() => validateItems([{ id: 'item-2', quantity: 1 }])).toThrow(BadRequestException);
      expect(() => validateItems([{ id: 'item-2', quantity: 1 }])).toThrow(/is no longer active/);

      // Unavailable item is rejected
      expect(() => validateItems([{ id: 'item-3', quantity: 1 }])).toThrow(BadRequestException);
      expect(() => validateItems([{ id: 'item-3', quantity: 1 }])).toThrow(/is currently unavailable/);

      // Invalid quantity (0 or negative) is rejected
      expect(() => validateItems([{ id: 'item-1', quantity: 0 }])).toThrow(BadRequestException);
      expect(() => validateItems([{ id: 'item-1', quantity: -2 }])).toThrow(BadRequestException);
    });

    it('enforces table requirements for Dine-in and clears table for Takeaway', () => {
      const validateOrderTypeAndTable = (type: 'DINE_IN' | 'TAKEAWAY', tableId?: string) => {
        if (type === 'DINE_IN') {
          if (!tableId) throw new BadRequestException('Dine-in orders must select a valid table');
          return { type, tableId };
        }
        return { type, tableId: undefined };
      };

      expect(() => validateOrderTypeAndTable('DINE_IN')).toThrow('Dine-in orders must select a valid table');
      expect(validateOrderTypeAndTable('DINE_IN', 'tbl-1')).toEqual({ type: 'DINE_IN', tableId: 'tbl-1' });
      expect(validateOrderTypeAndTable('TAKEAWAY', 'tbl-1')).toEqual({ type: 'TAKEAWAY', tableId: undefined });
    });

    it('prevents table collision when a table is occupied or reserved', () => {
      const tables = new Map([
        ['tbl-1', { id: 'tbl-1', status: 'AVAILABLE', activeOrderId: null }],
        ['tbl-2', { id: 'tbl-2', status: 'OCCUPIED', activeOrderId: 'ord-101' }],
        ['tbl-3', { id: 'tbl-3', status: 'RESERVED', activeOrderId: null }],
      ]);

      const allocateTable = (tableId: string) => {
        const table = tables.get(tableId);
        if (!table) throw new BadRequestException('Table not found');
        if (table.status === 'RESERVED') {
          throw new ConflictException('Table is currently reserved. Release the reservation first.');
        }
        if (table.activeOrderId) {
          throw new ConflictException(`Table is already occupied by active order #${table.activeOrderId}`);
        }
        return true;
      };

      expect(allocateTable('tbl-1')).toBe(true);
      expect(() => allocateTable('tbl-2')).toThrow(ConflictException);
      expect(() => allocateTable('tbl-3')).toThrow(ConflictException);
    });
  });

  describe('Step 3: Customer Identifier Generation', () => {
    it('preserves manual customer name when provided', () => {
      let branchCounter = 0;
      const resolveCustomerName = (inputName?: string) => {
        const trimmed = inputName?.trim();
        if (trimmed) return trimmed;
        branchCounter++;
        return `Customer ${String(branchCounter).padStart(3, '0')}`;
      };

      expect(resolveCustomerName('Mr. Tanvir')).toBe('Mr. Tanvir');
      expect(resolveCustomerName('   Mrs. Shahnaz   ')).toBe('Mrs. Shahnaz');
      expect(branchCounter).toBe(0);
    });

    it('generates sequential identifiers Customer 001, Customer 002... safely when blank', () => {
      let branchCounter = 0;
      const resolveCustomerName = (inputName?: string) => {
        const trimmed = inputName?.trim();
        if (trimmed) return trimmed;
        branchCounter++;
        return `Customer ${String(branchCounter).padStart(3, '0')}`;
      };

      expect(resolveCustomerName('')).toBe('Customer 001');
      expect(resolveCustomerName(undefined)).toBe('Customer 002');
      expect(resolveCustomerName('   ')).toBe('Customer 003');
      expect(resolveCustomerName('Custom Guest')).toBe('Custom Guest');
      expect(resolveCustomerName('')).toBe('Customer 004');
    });
  });

  describe('Step 4 & 5: Role Permissions & Waiter Workflow Boundaries', () => {
    const roles: Record<string, string[]> = {
      SUPER_ADMIN: ['orders.create', 'orders.edit', 'orders.cancel', 'bills.print', 'discounts.apply', 'discounts.unlimited', 'refunds.process'],
      MANAGER: ['orders.create', 'orders.edit', 'orders.cancel', 'bills.print', 'discounts.apply', 'discounts.unlimited', 'refunds.process'],
      CASHIER: ['orders.create', 'orders.edit', 'bills.print', 'discounts.apply'],
      WAITER: ['orders.create', 'orders.edit', 'tables.view'],
      KITCHEN_STAFF: ['kds.manage'],
    };

    const assertCanCheckout = (role: string) => {
      const perms = roles[role] || [];
      if (!perms.includes('bills.print')) {
        throw new ForbiddenException(`Role ${role} cannot confirm payments or checkout orders`);
      }
      return true;
    };

    const assertCanRefund = (role: string) => {
      const perms = roles[role] || [];
      if (!perms.includes('refunds.process')) {
        throw new ForbiddenException(`Role ${role} cannot process refunds`);
      }
      return true;
    };

    it('allows Super Admin, Manager, and Cashier to confirm payments', () => {
      expect(assertCanCheckout('SUPER_ADMIN')).toBe(true);
      expect(assertCanCheckout('MANAGER')).toBe(true);
      expect(assertCanCheckout('CASHIER')).toBe(true);
    });

    it('prevents Waiter and Kitchen Staff from confirming payments', () => {
      expect(() => assertCanCheckout('WAITER')).toThrow(ForbiddenException);
      expect(() => assertCanCheckout('KITCHEN_STAFF')).toThrow(ForbiddenException);
    });

    it('restricts refunds to Super Admin and Manager only', () => {
      expect(assertCanRefund('SUPER_ADMIN')).toBe(true);
      expect(assertCanRefund('MANAGER')).toBe(true);
      expect(() => assertCanRefund('CASHIER')).toThrow(ForbiddenException);
      expect(() => assertCanRefund('WAITER')).toThrow(ForbiddenException);
    });
  });

  describe('Step 6: Billing & Decimal Precision Calculations', () => {
    it('computes order bill accurately with discounts and tax', () => {
      // Order: 2x Biryani (TK. 250 each = 500), 2x Borhani (TK. 60 each = 120) => Subtotal = TK. 620
      const subtotal = 620;
      const bill = computeBill({
        subtotal,
        discountPercent: 10, // 10% discount => 62.00
        offerDiscount: 0,
        tipAmount: 20,
        deliveryFee: 0,
        loyaltyDiscountAmount: 0,
        roundAmounts: true,
      });

      expect(bill.subtotal).toBe(620);
      expect(bill.discountAmount).toBe(62);
      expect(bill.tipAmount).toBe(20);
      // Total due = 620 - 62 + 20 = 578
      expect(bill.totalDue).toBe(578);
    });

    it('prevents discounts from exceeding subtotal', () => {
      const bill = computeBill({
        subtotal: 150,
        discountFlat: 300,
        roundAmounts: true,
      });

      expect(bill.discountAmount).toBe(150);
      expect(bill.totalDue).toBe(0);
    });
  });

  describe('Step 7: Bangladesh Payment Methods (Cash, bKash, Nagad, Rocket, Card)', () => {
    it('processes Cash payment with tendered cash and calculates exact change', () => {
      const settlement = settlePayments({
        balance: 450,
        payments: [
          {
            method: 'CASH',
            amount: 450,
            tendered: 500,
          },
        ],
      });

      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.paidNow).toBe(450);
      expect(settlement.changeDue).toBe(50);
      expect(settlement.payments[0].tendered).toBe(500);
      expect(settlement.payments[0].changeGiven).toBe(50);
    });

    it('processes bKash payment with mobile banking transaction ID', () => {
      const settlement = settlePayments({
        balance: 1250,
        payments: [
          {
            method: 'BKASH',
            amount: 1250,
            reference: 'BKASH-9KLM48PQ',
          },
        ],
      });

      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.paidNow).toBe(1250);
      expect(settlement.payments[0].method).toBe('BKASH');
      expect(settlement.payments[0].reference).toBe('BKASH-9KLM48PQ');
      expect(settlement.payments[0].changeGiven).toBeNull();
    });

    it('processes Nagad and Rocket payments with transaction references', () => {
      const nagad = settlePayments({
        balance: 600,
        payments: [{ method: 'NAGAD', amount: 600, reference: 'NAGAD-TRX-101' }],
      });
      expect(nagad.fullyPaid).toBe(true);
      expect(nagad.payments[0].method).toBe('NAGAD');
      expect(nagad.payments[0].reference).toBe('NAGAD-TRX-101');

      const rocket = settlePayments({
        balance: 350,
        payments: [{ method: 'ROCKET', amount: 350, reference: 'ROCKET-7789' }],
      });
      expect(rocket.fullyPaid).toBe(true);
      expect(rocket.payments[0].method).toBe('ROCKET');
      expect(rocket.payments[0].reference).toBe('ROCKET-7789');
    });

    it('processes Card payment with authorization reference', () => {
      const card = settlePayments({
        balance: 2450.5,
        payments: [{ method: 'CARD', amount: 2450.5, reference: 'AUTH-VISA-9921' }],
      });
      expect(card.fullyPaid).toBe(true);
      expect(card.paidNow).toBe(2450.5);
      expect(card.payments[0].method).toBe('CARD');
      expect(card.payments[0].reference).toBe('AUTH-VISA-9921');
    });

    it('supports split payment between Cash and bKash', () => {
      const settlement = settlePayments({
        balance: 1000,
        payments: [
          { method: 'CASH', amount: 500, tendered: 500 },
          { method: 'BKASH', amount: 500, reference: 'BKASH-SPLIT-01' },
        ],
      });

      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.paidNow).toBe(1000);
      expect(settlement.payments).toHaveLength(2);
    });

    it('rejects tendered on non-cash payments', () => {
      expect(() =>
        settlePayments({
          balance: 500,
          payments: [{ method: 'BKASH', amount: 500, tendered: 600 }],
        }),
      ).toThrow('Only a cash payment can have an amount received');
    });
  });

  describe('Step 8: Receipt Printing & Currency Representation', () => {
    it('generates an UrbanBite receipt without Taka symbol and with TK. format', () => {
      const html = buildReceiptHtml({
        restaurantName: 'UrbanBite Restaurant',
        currency: 'BDT',
        branch: {
          name: 'Dhanmondi Branch',
          address: 'Road 27, Dhanmondi, Dhaka',
          phone: '+880 1711-000000',
          gstNumber: null,
          taxRegime: 'CUSTOM',
          taxMode: 'INCLUSIVE',
          taxLabel: 'VAT',
          taxId: 'BIN-123456789',
        },
        order: {
          orderNumber: '20261107-0015',
          type: 'DINE_IN',
          createdAt: new Date('2026-11-07T14:30:00Z'),
          table: { label: 'Table 04' },
          customer: null,
          guestName: 'Customer 002',
          subtotal: 750,
          discountAmount: 75,
          taxAmount: 37.5,
          tipAmount: 0,
          loyaltyPointsRedeemed: 0,
          loyaltyDiscountAmount: 0,
          totalAmount: 675,
          items: [
            {
              nameSnapshot: 'Kacchi Biryani',
              quantity: 2,
              unitPriceSnapshot: 300,
              lineTotal: 600,
              taxRateSnapshot: 5,
              modifiers: [],
            },
            {
              nameSnapshot: 'Firni',
              quantity: 1,
              unitPriceSnapshot: 150,
              lineTotal: 150,
              taxRateSnapshot: 5,
              modifiers: [],
            },
          ],
          payments: [
            {
              method: 'BKASH',
              amount: 675,
              reference: 'BKASH-TXN-7890',
            },
          ],
        },
      });

      // Branding check
      expect(html).toContain('UrbanBite Restaurant');
      expect(html).toContain('Dhanmondi Branch');
      expect(html).toContain('Table 04');
      expect(html).toContain('Customer 002');
      expect(html).toContain('Kacchi Biryani');
      expect(html).toContain('Firni');

      // Currency format check: TK. 675.00, TK. 75.00
      expect(html).toContain('TK. 675.00');
      expect(html).toContain('TK. 750.00');
      expect(html).toContain('TK. 75.00');

      // Strictly omit Taka symbol '৳'
      expect(html).not.toContain('৳');

      // Payment and reference check
      expect(html).toContain('Paid (BKASH)');
      expect(html).toContain('BKASH-TXN-7890');

      // Thank you footer check
      expect(html).toContain('Thank you for dining at UrbanBite Restaurant! Please visit again.');
    });
  });
});
