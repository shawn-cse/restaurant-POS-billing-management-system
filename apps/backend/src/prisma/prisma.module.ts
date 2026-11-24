import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseInitService } from './database-init.service';

@Global()
@Module({
  providers: [PrismaService, DatabaseInitService],
  exports: [PrismaService, DatabaseInitService],
})
export class PrismaModule {}
