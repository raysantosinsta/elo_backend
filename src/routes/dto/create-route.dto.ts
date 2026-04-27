/* eslint-disable prettier/prettier */
// src/routes/dto/optimize-route.dto.ts

/* eslint-disable prettier/prettier */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  isString,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export enum RouteOrderType {
  DISTANCE = 'DISTANCE',
  PRIORITY = 'PRIORITY',
}

export enum RouteStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELED = 'CANCELED',
}

// Interface para estatísticas da rota com tarefas
export interface RouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  formattedDuration: string;
  formattedDistance: string;
}

// Interface para estatísticas simples (rotas sem tarefas)
export interface SimpleRouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
}

// DTO existente para otimização com tarefas
export class OptimizeRouteDto {
  @IsNumber()
  driverLatitude: number;

  @IsNumber()
  driverLongitude: number;

  @IsArray()
  @IsUUID('4', { each: true })
  taskIds: string[];

  @IsOptional()
  @IsEnum(RouteOrderType)
  orderBy?: RouteOrderType;
}

// DTO para finalizar tarefa (existente)
export class FinalizeTaskDto {
  @IsString()
  status: 'COMPLETED' | 'FAILED' | 'RESCHEDULED';

  @IsOptional()
  @IsString()
  finalComment?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

// DTO para criar uma parada/stop da rota
export class RouteStopDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zipCode: string;

   @IsOptional()
  @IsString()
  numero?: string;  // ✅ JÁ ESTÁ CORRETO

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // 🔥 SE PRECISAR DE BAIRRO, USE:
  @IsOptional()
  @IsString()
  bairro?: string;
}

// src/routes/dto/optimize-route.dto.ts

// DTO para criar rota sem tarefas - REMOVIDO driverLatitude e driverLongitude
export class CreateRouteDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  routeDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops: RouteStopDto[];

  @IsOptional()
  @IsUUID()
  userAssignedId?: string;

  @IsOptional()
  @IsEnum(RouteOrderType)
  orderBy?: RouteOrderType;
}

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  routeDate?: string;

  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops?: RouteStopDto[];

  @IsOptional()
  @IsUUID()
  userAssignedId?: string;

  // ADICIONE ESTA LINHA ABAIXO:
  @IsOptional()
  @IsEnum(RouteOrderType)
  orderBy?: RouteOrderType;
}

// DTO para converter rota em tarefas
export class ConvertRouteToTasksDto {
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsOptional()
  @IsUUID()
  userAssignedId?: string;
}
