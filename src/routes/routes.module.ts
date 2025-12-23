import { Module } from '@nestjs/common';
import { RouteService } from './routes.service';
import { RouteController } from './routes.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [RouteController],
  providers: [RouteService, PrismaService],
})
export class RoutesModule {}
