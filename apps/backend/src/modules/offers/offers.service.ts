import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OfferDto,
  OfferEvaluationResult,
  OfferTypeDto,
  OfferUpdateDto,
  SessionUser,
} from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { BranchTimeService } from '../../common/services/branch-time.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly time: BranchTimeService,
  ) {}

  /**
   * Pure calculation and validation logic for promotional offers.
   * Enforces all financial constraints:
   *  - Active check
   *  - Validity window check (startsAt <= now <= expiresAt)
   *  - Minimum order amount check
   *  - Non-negative discount
   *  - Max 100% percentage check
   *  - Cap application (maxDiscount)
   *  - Discount cannot exceed subtotal (preventing negative total bills)
   *  - Precise 2-decimal arithmetic
   */
  static evaluateOfferDiscount(
    offer: {
      id?: string;
      name?: string;
      type: OfferTypeDto;
      value: number | Prisma.Decimal;
      minOrderAmount?: number | Prisma.Decimal;
      maxDiscount?: number | Prisma.Decimal | null;
      startsAt: Date | string;
      expiresAt: Date | string;
      isActive: boolean;
    },
    subtotal: number,
    now: Date = new Date(),
  ): OfferEvaluationResult {
    const rawSubtotal = round2(Number(subtotal) || 0);

    if (!offer.isActive) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'This offer is currently inactive',
      };
    }

    const startDate = new Date(offer.startsAt);
    const endDate = new Date(offer.expiresAt);

    if (now.getTime() < startDate.getTime()) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'This offer has not started yet',
      };
    }

    if (now.getTime() > endDate.getTime()) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'This offer has expired',
      };
    }

    if (rawSubtotal <= 0) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'Order subtotal must be greater than zero to apply a discount',
      };
    }

    const minAmount = round2(Number(offer.minOrderAmount || 0));
    if (rawSubtotal < minAmount) {
      return {
        valid: false,
        discountAmount: 0,
        reason: `Order subtotal (TK. ${rawSubtotal.toFixed(2)}) does not meet the minimum required amount of TK. ${minAmount.toFixed(2)}`,
      };
    }

    const val = Number(offer.value);
    if (val < 0) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'Discount value cannot be negative',
      };
    }

    let calculated = 0;
    if (offer.type === 'PERCENTAGE') {
      if (val > 100) {
        return {
          valid: false,
          discountAmount: 0,
          reason: 'Percentage discount cannot exceed 100%',
        };
      }
      calculated = (rawSubtotal * val) / 100;
      if (offer.maxDiscount != null && Number(offer.maxDiscount) > 0) {
        const cap = Number(offer.maxDiscount);
        calculated = Math.min(calculated, cap);
      }
    } else if (offer.type === 'FIXED') {
      calculated = val;
    } else {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'Unknown offer discount type',
      };
    }

    // A discount can never exceed the eligible bill amount
    const finalDiscount = round2(Math.min(calculated, rawSubtotal));

    if (finalDiscount <= 0) {
      return {
        valid: false,
        discountAmount: 0,
        reason: 'This offer yields no discount for this order',
      };
    }

    return {
      valid: true,
      discountAmount: finalDiscount,
      offerId: offer.id,
      offerName: offer.name,
      offerType: offer.type,
      offerValue: val,
    };
  }

  // --- CRUD Operations ----------------------------------------------------

  async listOffers(
    branchId: string,
    query?: { activeOnly?: boolean; search?: string },
  ) {
    const where: Prisma.OfferWhereInput = {
      branchId,
      ...(query?.activeOnly ? { isActive: true } : {}),
      ...(query?.search
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: Prisma.QueryMode.insensitive } },
              { description: { contains: query.search.trim(), mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    return this.prisma.offer.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }],
    });
  }

  async getOffer(branchId: string, id: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id, branchId },
    });
    if (!offer) {
      throw new NotFoundException('Promotional offer not found');
    }
    return offer;
  }

  async createOffer(branchId: string, dto: OfferDto, user: SessionUser) {
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);

    if (expiresAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('Expiration date and time must be after the start date and time');
    }

    if (dto.type === 'PERCENTAGE' && dto.value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    if (dto.value <= 0) {
      throw new BadRequestException('Discount value must be greater than zero');
    }

    const offer = await this.prisma.offer.create({
      data: {
        branchId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        value: new Prisma.Decimal(round2(dto.value)),
        minOrderAmount: new Prisma.Decimal(round2(dto.minOrderAmount ?? 0)),
        maxDiscount:
          dto.maxDiscount != null ? new Prisma.Decimal(round2(dto.maxDiscount)) : null,
        startsAt,
        expiresAt,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'offer.created',
      entity: 'Offer',
      entityId: offer.id,
      metadata: {
        offerName: offer.name,
        type: offer.type,
        value: Number(offer.value),
        startsAt: offer.startsAt,
        expiresAt: offer.expiresAt,
      },
    });

    this.realtime.emitToBranch(branchId, 'offer.created', offer);
    return offer;
  }

  async updateOffer(
    branchId: string,
    id: string,
    dto: OfferUpdateDto,
    user: SessionUser,
  ) {
    const existing = await this.getOffer(branchId, id);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : existing.expiresAt;

    if (expiresAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('Expiration date and time must be after the start date and time');
    }

    const type = dto.type ?? existing.type;
    const value = dto.value !== undefined ? dto.value : Number(existing.value);

    if (type === 'PERCENTAGE' && value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    if (value <= 0) {
      throw new BadRequestException('Discount value must be greater than zero');
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: new Prisma.Decimal(round2(dto.value)) } : {}),
        ...(dto.minOrderAmount !== undefined
          ? { minOrderAmount: new Prisma.Decimal(round2(dto.minOrderAmount)) }
          : {}),
        ...(dto.maxDiscount !== undefined
          ? {
              maxDiscount:
                dto.maxDiscount != null ? new Prisma.Decimal(round2(dto.maxDiscount)) : null,
            }
          : {}),
        ...(dto.startsAt ? { startsAt } : {}),
        ...(dto.expiresAt ? { expiresAt } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'offer.updated',
      entity: 'Offer',
      entityId: updated.id,
      metadata: {
        offerName: updated.name,
        type: updated.type,
        value: Number(updated.value),
        isActive: updated.isActive,
      },
    });

    this.realtime.emitToBranch(branchId, 'offer.updated', updated);
    return updated;
  }

  async toggleOfferActive(
    branchId: string,
    id: string,
    isActive: boolean,
    user: SessionUser,
  ) {
    await this.getOffer(branchId, id);

    const updated = await this.prisma.offer.update({
      where: { id },
      data: { isActive },
    });

    await this.audit.record({
      userId: user.id,
      action: 'offer.status_changed',
      entity: 'Offer',
      entityId: updated.id,
      metadata: {
        offerName: updated.name,
        isActive: updated.isActive,
      },
    });

    this.realtime.emitToBranch(branchId, 'offer.updated', updated);
    return updated;
  }

  async deleteOffer(branchId: string, id: string, user: SessionUser) {
    const existing = await this.getOffer(branchId, id);

    // If offer is associated with finalized past orders, preserve history by deactivating
    const orderCount = await this.prisma.order.count({ where: { offerId: id } });
    if (orderCount > 0) {
      const deactivated = await this.prisma.offer.update({
        where: { id },
        data: { isActive: false },
      });

      await this.audit.record({
        userId: user.id,
        action: 'offer.deactivated_on_delete',
        entity: 'Offer',
        entityId: id,
        metadata: {
          offerName: existing.name,
          orderCount,
          reason: 'Offer has past order history; deactivated instead of deleted',
        },
      });

      this.realtime.emitToBranch(branchId, 'offer.updated', deactivated);
      return {
        ok: true,
        deactivated: true,
        message: 'This offer is referenced in past orders and has been deactivated instead of deleted to protect financial history.',
      };
    }

    await this.prisma.offer.delete({ where: { id } });

    await this.audit.record({
      userId: user.id,
      action: 'offer.deleted',
      entity: 'Offer',
      entityId: id,
      metadata: {
        offerName: existing.name,
      },
    });

    this.realtime.emitToBranch(branchId, 'offer.deleted', { id });
    return { ok: true, deleted: true };
  }

  // --- POS and Billing Discount Evaluation ---------------------------------

  /**
   * Evaluates a specific offer by ID against an order subtotal.
   */
  async evaluateOffer(branchId: string, offerId: string, subtotal: number, now = new Date()) {
    const offer = await this.getOffer(branchId, offerId);
    return OffersService.evaluateOfferDiscount(
      {
        id: offer.id,
        name: offer.name,
        type: offer.type,
        value: Number(offer.value),
        minOrderAmount: Number(offer.minOrderAmount),
        maxDiscount: offer.maxDiscount != null ? Number(offer.maxDiscount) : null,
        startsAt: offer.startsAt,
        expiresAt: offer.expiresAt,
        isActive: offer.isActive,
      },
      subtotal,
      now,
    );
  }

  /**
   * Discovers all available, currently valid promotional offers for a branch and order subtotal.
   * Sorted descending by maximum discount savings (best value first).
   */
  async listAvailableOffersForCheckout(
    branchId: string,
    subtotal: number,
    now = new Date(),
  ) {
    const activeOffers = await this.prisma.offer.findMany({
      where: {
        branchId,
        isActive: true,
        startsAt: { lte: now },
        expiresAt: { gte: now },
      },
    });

    const evaluated = activeOffers
      .map((offer) =>
        OffersService.evaluateOfferDiscount(
          {
            id: offer.id,
            name: offer.name,
            type: offer.type,
            value: Number(offer.value),
            minOrderAmount: Number(offer.minOrderAmount),
            maxDiscount: offer.maxDiscount != null ? Number(offer.maxDiscount) : null,
            startsAt: offer.startsAt,
            expiresAt: offer.expiresAt,
            isActive: offer.isActive,
          },
          subtotal,
          now,
        ),
      )
      .filter((res): res is OfferEvaluationResult & { valid: true } => res.valid);

    // Sort best discount first
    return evaluated.sort((a, b) => b.discountAmount - a.discountAmount);
  }
}
