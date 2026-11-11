import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  canTransitionKot,
  DEFAULT_ROLE_PERMISSIONS,
  type KotStatusDto,
  type SessionUser,
} from '@nodedr-restaurant/types';
import { OrdersService } from './orders.service';
import { TablesService } from '../tables/tables.service';

describe('Phase 10: Waiter Dashboard, Food Delivery and Table Release', () => {
  describe('Ready Food Query (listReadyFood)', () => {
    it('queries tickets in READY status with table, customer, and items', async () => {
      let capturedArgs: any = null;
      const fakePrisma: any = {
        kot: {
          findMany: jest.fn(async (args: any) => {
            capturedArgs = args;
            return [
              {
                id: 'kot_1',
                orderId: 'order_1',
                ticketNumber: '1001-1',
                status: 'READY',
                readyAt: new Date(),
                order: {
                  id: 'order_1',
                  orderNumber: '1001',
                  type: 'DINE_IN',
                  table: { id: 't_3', number: '03', name: null },
                  guestName: 'Customer 001',
                  notes: 'Extra spicy',
                  customer: { name: 'Customer 001', phone: '01700000000' },
                },
                items: [
                  {
                    id: 'ki_1',
                    orderItem: {
                      nameSnapshot: 'Chicken Biryani',
                      quantity: 2,
                      modifiers: [],
                    },
                  },
                  {
                    id: 'ki_2',
                    orderItem: {
                      nameSnapshot: 'Coke',
                      quantity: 2,
                      modifiers: [],
                    },
                  },
                ],
              },
            ];
          }),
        },
      };

      const ordersService = new OrdersService(
        fakePrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await ordersService.listReadyFood('branch_1');

      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.where.order.branchId).toBe('branch_1');
      expect(capturedArgs.where.status).toBe('READY');
      expect(result).toHaveLength(1);
      expect(result[0].order.orderNumber).toBe('1001');
      expect(result[0].order.table?.number).toBe('03');
      expect(result[0].items).toHaveLength(2);
    });
  });

  describe('Food Delivery Actions (markFoodDelivered)', () => {
    it('marks a Dine-in ready ticket as SERVED, stamps servedAt, and records audit trail', async () => {
      let updatedKotData: any = null;
      let updatedOrderData: any = null;
      let recordedAudit: any = null;
      let emittedEvents: any[] = [];

      const fakeKot = {
        id: 'kot_ready_1',
        orderId: 'order_1',
        status: 'READY',
        order: {
          id: 'order_1',
          orderNumber: '1001',
          type: 'DINE_IN',
          table: { id: 't_3', number: '03' },
          customer: { name: 'Customer 001' },
        },
      };

      const fakePrisma: any = {
        kot: {
          findFirst: jest.fn(async () => fakeKot),
        },
        $transaction: jest.fn(async (cb: any) => {
          const tx: any = {
            kot: {
              updateMany: jest.fn(async ({ data }: any) => {
                updatedKotData = data;
                return { count: 1 };
              }),
            },
            kotItem: {
              updateMany: jest.fn(async () => ({ count: 2 })),
            },
            order: {
              update: jest.fn(async ({ data }: any) => {
                updatedOrderData = data;
                return {};
              }),
            },
          };
          return cb(tx);
        }),
      };

      const fakeRealtime: any = {
        emitToBranch: jest.fn((branchId, event, payload) => {
          emittedEvents.push({ event, payload });
        }),
      };

      const fakeAudit: any = {
        record: jest.fn(async (args) => {
          recordedAudit = args;
        }),
      };

      const ordersService = new OrdersService(
        fakePrisma,
        fakeRealtime,
        fakeAudit,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      jest.spyOn(ordersService, 'getOrder').mockResolvedValue({ id: 'order_1' } as any);

      await ordersService.markFoodDelivered('branch_1', 'kot_ready_1', 'waiter_1', false);

      expect(updatedKotData.status).toBe('SERVED');
      expect(updatedKotData.servedAt).toBeInstanceOf(Date);
      expect(updatedOrderData.deliveredAt).toBeInstanceOf(Date);
      expect(recordedAudit.action).toBe('order.food_delivered');
      expect(recordedAudit.metadata.responsibleStaffId).toBe('waiter_1');
      expect(recordedAudit.metadata.orderNumber).toBe('1001');
      expect(recordedAudit.metadata.tableNumber).toBe('03');
      expect(emittedEvents.some((e) => e.event === 'kot.updated')).toBe(true);
      expect(emittedEvents.some((e) => e.event === 'order.updated')).toBe(true);
    });

    it('marks a Takeaway ready ticket as SERVED with order.food_handed_over audit', async () => {
      let recordedAudit: any = null;
      const fakeKot = {
        id: 'kot_takeaway_1',
        orderId: 'order_takeaway_1',
        status: 'READY',
        order: {
          id: 'order_takeaway_1',
          orderNumber: '1002',
          type: 'TAKEAWAY',
          table: null,
          customer: { name: 'Customer 002' },
        },
      };

      const fakePrisma: any = {
        kot: {
          findFirst: jest.fn(async () => fakeKot),
        },
        $transaction: jest.fn(async (cb: any) => {
          const tx: any = {
            kot: { updateMany: jest.fn(async () => ({ count: 1 })) },
            kotItem: { updateMany: jest.fn(async () => ({ count: 1 })) },
            order: { update: jest.fn(async () => ({})) },
          };
          return cb(tx);
        }),
      };

      const fakeAudit: any = {
        record: jest.fn(async (args) => {
          recordedAudit = args;
        }),
      };

      const ordersService = new OrdersService(
        fakePrisma,
        { emitToBranch: jest.fn() } as any,
        fakeAudit,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      jest.spyOn(ordersService, 'getOrder').mockResolvedValue({ id: 'order_takeaway_1' } as any);

      await ordersService.markFoodDelivered('branch_1', 'kot_takeaway_1', 'waiter_1', true);

      expect(recordedAudit.action).toBe('order.food_handed_over');
      expect(recordedAudit.metadata.orderType).toBe('TAKEAWAY');
      expect(recordedAudit.metadata.tableNumber).toBeNull();
    });

    it('prevents duplicate completion if ticket has already been marked SERVED', async () => {
      const alreadyServedKot = {
        id: 'kot_served_1',
        orderId: 'order_1',
        status: 'SERVED',
        order: {
          id: 'order_1',
          orderNumber: '1001',
          type: 'DINE_IN',
          table: { id: 't_3', number: '03' },
        },
      };

      const fakePrisma: any = {
        kot: {
          findFirst: jest.fn(async () => alreadyServedKot),
        },
      };

      const ordersService = new OrdersService(
        fakePrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        ordersService.markFoodDelivered('branch_1', 'kot_served_1', 'waiter_1'),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents delivery if food is not in READY state (e.g. still PREPARING)', async () => {
      const preparingKot = {
        id: 'kot_prep_1',
        orderId: 'order_1',
        status: 'PREPARING',
        order: {
          id: 'order_1',
          orderNumber: '1001',
          type: 'DINE_IN',
          table: { id: 't_3', number: '03' },
        },
      };

      const fakePrisma: any = {
        kot: {
          findFirst: jest.fn(async () => preparingKot),
        },
      };

      const ordersService = new OrdersService(
        fakePrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        ordersService.markFoodDelivered('branch_1', 'kot_prep_1', 'waiter_1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Table Release Logic (releaseTable)', () => {
    it('releases table to AVAILABLE when no active unbilled orders exist', async () => {
      let updatedTableData: any = null;
      const fakePrisma: any = {
        table: {
          findFirst: jest.fn(async () => ({ id: 'table_1', floor: { branchId: 'b_1' } })),
          update: jest.fn(async ({ data }: any) => {
            updatedTableData = data;
            return { id: 'table_1', status: 'AVAILABLE' };
          }),
        },
        order: {
          findFirst: jest.fn(async () => null), // No active unbilled order
        },
      };

      const tablesService = new TablesService(
        fakePrisma,
        { emitToBranch: jest.fn() } as any,
        { record: jest.fn() } as any,
      );

      const waiterUser: SessionUser = {
        id: 'waiter_1',
        restaurantId: 'r_1',
        roleId: 'WAITER',
        roleName: 'Waiter',
        permissions: ['tables.view', 'orders.create'],
      };

      const result = await tablesService.releaseTable('b_1', 'table_1', waiterUser);

      expect(updatedTableData.status).toBe('AVAILABLE');
      expect(result.status).toBe('AVAILABLE');
    });

    it('blocks table release when table has an active unpaid/unbilled order', async () => {
      const fakePrisma: any = {
        table: {
          findFirst: jest.fn(async () => ({ id: 'table_1', floor: { branchId: 'b_1' } })),
        },
        order: {
          findFirst: jest.fn(async () => ({
            id: 'active_order_1',
            orderNumber: '1001',
            status: 'OPEN',
          })),
        },
      };

      const tablesService = new TablesService(
        fakePrisma,
        { emitToBranch: jest.fn() } as any,
        { record: jest.fn() } as any,
      );

      const waiterUser: SessionUser = {
        id: 'waiter_1',
        restaurantId: 'r_1',
        roleId: 'WAITER',
        roleName: 'Waiter',
        permissions: ['tables.view', 'orders.create'],
      };

      await expect(
        tablesService.releaseTable('b_1', 'table_1', waiterUser),
      ).rejects.toThrow(ConflictException);
    });

    it('permits authorized Manager override to force-release occupied table and logs audit', async () => {
      let auditRecord: any = null;
      let orderDisassociated = false;

      const fakePrisma: any = {
        table: {
          findFirst: jest.fn(async () => ({ id: 'table_1', floor: { branchId: 'b_1' } })),
          update: jest.fn(async () => ({ id: 'table_1', status: 'AVAILABLE' })),
        },
        order: {
          findFirst: jest.fn(async () => ({
            id: 'active_order_1',
            orderNumber: '1001',
            status: 'OPEN',
          })),
          update: jest.fn(async () => {
            orderDisassociated = true;
          }),
        },
      };

      const fakeAudit = {
        record: jest.fn(async (args) => {
          auditRecord = args;
        }),
      };

      const tablesService = new TablesService(
        fakePrisma,
        { emitToBranch: jest.fn() } as any,
        fakeAudit as any,
      );

      const managerUser: SessionUser = {
        id: 'manager_1',
        restaurantId: 'r_1',
        roleId: 'MANAGER',
        roleName: 'Manager',
        permissions: ['tables.manage', 'tables.view'],
      };

      const result = await tablesService.releaseTable(
        'b_1',
        'table_1',
        managerUser,
        true,
        'Guest relocated to VIP dining room',
      );

      expect(orderDisassociated).toBe(true);
      expect(auditRecord.action).toBe('table.force_released');
      expect(auditRecord.metadata.reason).toBe('Guest relocated to VIP dining room');
      expect(result.status).toBe('AVAILABLE');
    });

    it('forbids unauthorized staff from force-releasing table with force=true', async () => {
      const fakePrisma: any = {
        table: {
          findFirst: jest.fn(async () => ({ id: 'table_1', floor: { branchId: 'b_1' } })),
        },
        order: {
          findFirst: jest.fn(async () => ({ id: 'o_1', orderNumber: '1001', status: 'OPEN' })),
        },
      };

      const tablesService = new TablesService(
        fakePrisma,
        { emitToBranch: jest.fn() } as any,
        { record: jest.fn() } as any,
      );

      const waiterUser: SessionUser = {
        id: 'waiter_1',
        restaurantId: 'r_1',
        roleId: 'WAITER',
        roleName: 'Waiter',
        permissions: ['tables.view', 'orders.create'],
      };

      await expect(
        tablesService.releaseTable('b_1', 'table_1', waiterUser, true, 'Trying to force'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Permission Boundaries', () => {
    it('confirms Waiter has orders.create and tables.view, but not kds.manage', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.WAITER).toContain('orders.create');
      expect(DEFAULT_ROLE_PERMISSIONS.WAITER).toContain('tables.view');
      expect(DEFAULT_ROLE_PERMISSIONS.WAITER).not.toContain('kds.manage');
    });
  });
});
