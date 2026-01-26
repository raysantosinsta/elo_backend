/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { MaterialsController } from './materials.controller';
import { PrismaModule } from 'src/prisma/prisma.module'; // Importe o Prisma

@Module({
  imports: [PrismaModule], 
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}