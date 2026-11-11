import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  evaluateOfferDtoSchema,
  offerDtoSchema,
  offerUpdateDtoSchema,
  type EvaluateOfferDto,
  type OfferDto,
  type OfferUpdateDto,
  type SessionUser,
} from '@nodedr-restaurant/types';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { OffersService } from './offers.service';

const toggleActiveSchema = z.object({
  isActive: z.boolean(),
});

@ApiTags('offers')
@Controller('v1/offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('offers.view')
  @Get()
  async listOffers(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('search') search?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.listOffers(branchId, {
      activeOnly: activeOnly === 'true',
      search,
    });
  }

  @Auth('discounts.apply')
  @Get('available')
  async listAvailableOffers(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('subtotal') subtotalStr?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const subtotal = Number(subtotalStr) || 0;
    return this.offersService.listAvailableOffersForCheckout(branchId, subtotal);
  }

  @Auth('discounts.apply')
  @Post('calculate')
  @UsePipes(new ZodValidationPipe(evaluateOfferDtoSchema))
  async calculateDiscount(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() dto: EvaluateOfferDto,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.evaluateOffer(branchId, dto.offerId, dto.subtotal);
  }

  @Auth('offers.view')
  @Get(':id')
  async getOffer(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.getOffer(branchId, id);
  }

  @Auth('offers.manage')
  @Post()
  @UsePipes(new ZodValidationPipe(offerDtoSchema))
  async createOffer(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() dto: OfferDto,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.createOffer(branchId, dto, user);
  }

  @Auth('offers.manage')
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(offerUpdateDtoSchema))
  async updateOffer(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() dto: OfferUpdateDto,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.updateOffer(branchId, id, dto, user);
  }

  @Auth('offers.manage')
  @Patch(':id/active')
  @UsePipes(new ZodValidationPipe(toggleActiveSchema))
  async toggleActive(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.toggleOfferActive(branchId, id, body.isActive, user);
  }

  @Auth('offers.manage')
  @Delete(':id')
  async deleteOffer(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.offersService.deleteOffer(branchId, id, user);
  }
}
