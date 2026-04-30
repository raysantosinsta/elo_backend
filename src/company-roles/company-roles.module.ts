/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CompanyRolesService } from './company-roles.service';
import { CompanyRolesController } from './company-roles.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyRolesController],
  providers: [CompanyRolesService],
  exports: [CompanyRolesService],
})
export class CompanyRolesModule {}