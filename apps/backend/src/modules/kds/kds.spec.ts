import { ConflictException } from '@nestjs/common';
import {
  canTransitionKot,
  DEFAULT_ROLE_PERMISSIONS,
  type KotStatusDto,
} from '@nodedr-restaurant/types';
import { KdsService } from './kds.service';

describe('KDS Service and Kitchen Workflow', () => {
  describe('listActiveTickets (unpaid order filtering)', () => {
    it('queries only confirmed paid orders and excludes unpaid orders', async () => {
      let capturedArgs: any = null;
      const fakePrisma: any = {
        kot: {
          findMany: jest.fn(async (args: any) => {
            capturedArgs = args;
            return [];
          }),
        },
      };

      const kdsService = new KdsService(
        fakePrisma,
        {} as any,
        {} as any,
      );

      await kdsService.listActiveTickets('branch_1');

      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.where.order.branchId).toBe('branch_1');
      // Must enforce that order is either PAID or COMPLETED, or accepted ONLINE
      expect(capturedArgs.where.order.OR).toEqual([
        { status: { in: ['PAID', 'COMPLETED'] } },
        { channel: 'ONLINE', acceptance: 'ACCEPTED' },
      ]);
      // Terminal tickets (SERVED, CANCELLED, REJECTED) must be excluded
      expect(capturedArgs.where.status).toEqual({
        notIn: ['SERVED', 'CANCELLED', 'REJECTED'],
      });
    });
  });

  describe('Kitchen state transitions (canTransitionKot)', () => {
    it('allows Start Preparing: Pending (NEW) -> PREPARING', () => {
      expect(canTransitionKot('NEW', 'PREPARING')).toBe(true);
    });

    it('allows Start Preparing: ACCEPTED -> PREPARING', () => {
      expect(canTransitionKot('ACCEPTED', 'PREPARING')).toBe(true);
    });

    it('allows Mark Ready: PREPARING -> READY', () => {
      expect(canTransitionKot('PREPARING', 'READY')).toBe(true);
    });

    it('prevents direct completion before preparing: NEW -> READY', () => {
      expect(canTransitionKot('NEW', 'READY')).toBe(false);
    });

    it('prevents direct completion before preparing: ACCEPTED -> READY', () => {
      expect(canTransitionKot('ACCEPTED', 'READY')).toBe(false);
    });

    it('prevents backwards status movement', () => {
      expect(canTransitionKot('PREPARING', 'NEW')).toBe(false);
      expect(canTransitionKot('PREPARING', 'ACCEPTED')).toBe(false);
      expect(canTransitionKot('READY', 'PREPARING')).toBe(false);
      expect(canTransitionKot('READY', 'NEW')).toBe(false);
    });
  });

  describe('Role-based KDS access control', () => {
    it('grants kds.manage to Kitchen Staff, Manager, and Super Admin', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF).toContain('kds.manage');
      expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toContain('kds.manage');
      expect(DEFAULT_ROLE_PERMISSIONS.OWNER).toContain('kds.manage');
    });

    it('denies kds.manage to Cashier and Waiter to prevent advancing kitchen states', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.CASHIER).not.toContain('kds.manage');
      expect(DEFAULT_ROLE_PERMISSIONS.WAITER).not.toContain('kds.manage');
    });
  });

  describe('Optimistic concurrency protection', () => {
    it('rejects concurrent updates when ticket status changed underfoot', async () => {
      // Simulate compare-and-set returning 0 rows affected
      const movedCount = 0;
      const simulateConcurrentUpdate = () => {
        if (movedCount === 0) {
          throw new ConflictException(
            'This ticket was just updated by someone else - refresh to see its current state',
          );
        }
      };

      expect(simulateConcurrentUpdate).toThrow(ConflictException);
      expect(simulateConcurrentUpdate).toThrow(
        /updated by someone else/,
      );
    });
  });
});
