import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { BranchTimeService } from '../../common/services/branch-time.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [AuditModule],
  controllers: [OffersController],
  providers: [OffersService, BranchAccessService, BranchTimeService],
  exports: [OffersService],
})
export class OffersModule {}
