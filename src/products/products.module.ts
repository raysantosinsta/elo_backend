/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule], // <--- Importante: Permite usar o PrismaService
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
