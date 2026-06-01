/* eslint-disable prettier/prettier */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,          // 🔥 CORRIGIDO: antes estava 'isString' minúsculo
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
  // 🔥 NOVO: consumo de combustível
  fuelConsumptionLitres?: number | null;
  formattedFuelConsumption?: string;
}

// Interface para estatísticas simples (rotas sem tarefas)
export interface SimpleRouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  // 🔥 NOVO: consumo de combustível
  fuelConsumptionLitres?: number | null;
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
  numero?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  bairro?: string;
}

// DTO para criar rota sem tarefas
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

// 🔥 NOVO DTO PARA RESPOSTA DE ROTA (opcional, mas recomendado)
export class RouteResponseDto {
  id: string;
  title: string;
  description?: string;
  routeDate?: Date;
  status: RouteStatus;
  orderBy?: string;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  fuelConsumptionLitres?: number | null;
  stops?: RouteStopDto[];
  userAssigned?: { id: string; name: string; contact?: string };
  formattedDistance?: string;
  formattedDuration?: string;
  formattedFuelConsumption?: string;
}