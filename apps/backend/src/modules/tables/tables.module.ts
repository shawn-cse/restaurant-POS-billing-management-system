import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [AuditModule],
  controllers: [TablesController],
  providers: [TablesService, BranchAccessService],
  exports: [TablesService],
})
export class TablesModule {}
