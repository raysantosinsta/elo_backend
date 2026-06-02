/* eslint-disable prettier/prettier */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

// ============================================
// ENUMS
// ============================================

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

// ============================================
// INTERFACES
// ============================================

export interface RouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  formattedDuration: string;
  formattedDistance: string;
}

export interface SimpleRouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
}

// ============================================
// DTOS EXISTENTES
// ============================================

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

export class FinalizeTaskDto {
  @IsString()
  @IsIn(['COMPLETED', 'FAILED', 'RESCHEDULED'])
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

// ============================================
// NOVO DTO: CompleteRouteDto (para motorista finalizar rota)
// ============================================

export class CompleteRouteDto {
  @IsOptional()
  @IsNumber()
  distanciaReal?: number; // Km rodados

  @IsOptional()
  @IsNumber()
  combustivelReal?: number; // Litros consumidos

  @IsOptional()
  @IsString()
  observacoes?: string;
}

// ============================================
// DTO PARA PARADA (STOP)
// ============================================

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

// ============================================
// DTO PARA CRIAR ROTA
// ============================================

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

  // 🔥 NOVO CAMPO: Combustível previsto (litros)
  @IsOptional()
  @IsNumber()
  combustivelPrevisto?: number;
}

// ============================================
// DTO PARA ATUALIZAR ROTA
// ============================================

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

  // 🔥 NOVO CAMPO: Combustível previsto (litros)
  @IsOptional()
  @IsNumber()
  combustivelPrevisto?: number;
}

// ============================================
// DTO PARA CONVERTER ROTA EM TAREFAS
// ============================================

export class ConvertRouteToTasksDto {
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsOptional()
  @IsUUID()
  userAssignedId?: string;
}