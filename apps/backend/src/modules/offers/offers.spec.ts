import { DEFAULT_ROLE_PERMISSIONS } from '@nodedr-restaurant/types';
import { OffersService, round2 } from './offers.service';

describe('OffersService - Phase 06 Offers and Discount Management', () => {
  const referenceNow = new Date('2026-11-07T14:00:00Z'); // 8:00 PM in Asia/Dhaka (+06:00)

  const activePercentOffer = {
    id: 'offer-15-pct',
    name: '15% Off Special',
    type: 'PERCENTAGE' as const,
    value: 15,
    minOrderAmount: 500,
    maxDiscount: 300,
    startsAt: new Date('2026-11-01T00:00:00Z'),
    expiresAt: new Date('2026-11-30T23:59:59Z'),
    isActive: true,
  };

  const activeFixedOffer = {
    id: 'offer-flat-150',
    name: 'Flat TK. 150 Off',
    type: 'FIXED' as const,
    value: 150,
    minOrderAmount: 800,
    maxDiscount: null,
    startsAt: new Date('2026-11-01T00:00:00Z'),
    expiresAt: new Date('2026-11-30T23:59:59Z'),
    isActive: true,
  };

  describe('Percentage Discount Rules', () => {
    it('calculates standard percentage discount accurately', () => {
      const res = OffersService.evaluateOfferDiscount(activePercentOffer, 1000, referenceNow);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(150.0);
      expect(res.offerName).toBe('15% Off Special');
    });

    it('enforces maximum discount cap for percentage offers', () => {
      // 15% of 3000 is 450, but maxDiscount is 300
      const res = OffersService.evaluateOfferDiscount(activePercentOffer, 3000, referenceNow);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(300.0);
    });

    it('prevents percentage values exceeding 100%', () => {
      const invalidOffer = { ...activePercentOffer, value: 120 };
      const res = OffersService.evaluateOfferDiscount(invalidOffer, 1000, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/exceed 100%/);
    });

    it('handles precise decimal values and fractional prices (TK. 255.50 * 15% = TK. 38.33)', () => {
      const res = OffersService.evaluateOfferDiscount(activePercentOffer, 555.55, referenceNow);
      expect(res.valid).toBe(true);
      // 555.55 * 0.15 = 83.3325 -> 83.33
      expect(res.discountAmount).toBe(83.33);
    });
  });

  describe('Fixed-Amount Discount Rules', () => {
    it('applies flat fixed discount when subtotal meets minOrderAmount', () => {
      const res = OffersService.evaluateOfferDiscount(activeFixedOffer, 1200, referenceNow);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(150.0);
    });

    it('rejects fixed discount when subtotal is below minOrderAmount', () => {
      const res = OffersService.evaluateOfferDiscount(activeFixedOffer, 750, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/minimum required amount/);
    });
  });

  describe('Excessive Discount Prevention', () => {
    it('prevents discount from exceeding the eligible bill subtotal', () => {
      const hugeFixedOffer = {
        id: 'offer-huge',
        name: 'Huge Flat 600 Off',
        type: 'FIXED' as const,
        value: 600,
        minOrderAmount: 100,
        startsAt: new Date('2026-11-01T00:00:00Z'),
        expiresAt: new Date('2026-11-30T23:59:59Z'),
        isActive: true,
      };

      // Bill is only TK. 450. Discount must be capped at 450, never allowing a negative bill
      const res = OffersService.evaluateOfferDiscount(hugeFixedOffer, 450, referenceNow);
      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(450.0);
    });

    it('prevents negative discount amounts', () => {
      const negativeOffer = { ...activeFixedOffer, value: -50 };
      const res = OffersService.evaluateOfferDiscount(negativeOffer, 1000, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/cannot be negative/);
    });
  });

  describe('Offer Validity & Expiration Rules', () => {
    it('rejects inactive offers', () => {
      const inactiveOffer = { ...activePercentOffer, isActive: false };
      const res = OffersService.evaluateOfferDiscount(inactiveOffer, 1000, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/currently inactive/);
    });

    it('rejects expired offers', () => {
      const expiredOffer = {
        ...activePercentOffer,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2026-11-01T00:00:00Z'), // expired before referenceNow
      };
      const res = OffersService.evaluateOfferDiscount(expiredOffer, 1000, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/has expired/);
    });

    it('rejects offers that have not started yet', () => {
      const futureOffer = {
        ...activePercentOffer,
        startsAt: new Date('2026-11-15T00:00:00Z'), // starts in future
        expiresAt: new Date('2026-11-30T00:00:00Z'),
      };
      const res = OffersService.evaluateOfferDiscount(futureOffer, 1000, referenceNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/has not started yet/);
    });
  });

  describe('Timezone behavior (Asia/Dhaka UTC+06:00)', () => {
    it('correctly evaluates boundary timestamps according to Bangladesh time', () => {
      // 2026-11-07 23:59:59 in Dhaka is 2026-11-07 17:59:59 UTC
      const dhakaExpiryOffer = {
        ...activePercentOffer,
        startsAt: new Date('2026-11-01T00:00:00+06:00'),
        expiresAt: new Date('2026-11-07T23:59:59+06:00'),
      };

      // 10:00 PM Dhaka time on Nov 7 (16:00 UTC) -> should be valid
      const validTimeDhaka = new Date('2026-11-07T22:00:00+06:00');
      const validRes = OffersService.evaluateOfferDiscount(dhakaExpiryOffer, 1000, validTimeDhaka);
      expect(validRes.valid).toBe(true);

      // 12:05 AM Dhaka time on Nov 8 (18:05 UTC Nov 7) -> should be expired
      const expiredTimeDhaka = new Date('2026-11-08T00:05:00+06:00');
      const expiredRes = OffersService.evaluateOfferDiscount(dhakaExpiryOffer, 1000, expiredTimeDhaka);
      expect(expiredRes.valid).toBe(false);
      expect(expiredRes.reason).toMatch(/has expired/);
    });
  });

  describe('Role & Permission Controls (Phase 06 Step 3)', () => {
    it('confirms Super Admin and Manager hold offers.manage and offers.view', () => {
      const superAdminPerms = DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
      const managerPerms = DEFAULT_ROLE_PERMISSIONS.MANAGER;

      expect(superAdminPerms).toContain('offers.manage');
      expect(superAdminPerms).toContain('offers.view');
      expect(superAdminPerms).toContain('discounts.apply');
      expect(superAdminPerms).toContain('discounts.unlimited');

      expect(managerPerms).toContain('offers.manage');
      expect(managerPerms).toContain('offers.view');
      expect(managerPerms).toContain('discounts.apply');
      expect(managerPerms).toContain('discounts.unlimited');
    });

    it('confirms Cashier holds discounts.apply and offers.view, but CANNOT manage offers', () => {
      const cashierPerms = DEFAULT_ROLE_PERMISSIONS.CASHIER;

      expect(cashierPerms).toContain('offers.view');
      expect(cashierPerms).toContain('discounts.apply');
      expect(cashierPerms).not.toContain('offers.manage');
      expect(cashierPerms).not.toContain('discounts.unlimited');
    });

    it('confirms Waiter CANNOT manage offers or apply discounts', () => {
      const waiterPerms = DEFAULT_ROLE_PERMISSIONS.WAITER;

      expect(waiterPerms).not.toContain('offers.manage');
      expect(waiterPerms).not.toContain('offers.view');
      expect(waiterPerms).not.toContain('discounts.apply');
      expect(waiterPerms).not.toContain('discounts.unlimited');
    });

    it('confirms Kitchen Staff has zero access to offers or discounts', () => {
      const kitchenPerms = DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF;

      expect(kitchenPerms).not.toContain('offers.manage');
      expect(kitchenPerms).not.toContain('offers.view');
      expect(kitchenPerms).not.toContain('discounts.apply');
      expect(kitchenPerms).not.toContain('discounts.unlimited');
    });
  });
});
