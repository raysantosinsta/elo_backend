/* eslint-disable prettier/prettier */
import { 
  IsArray, 
  IsDateString, 
  IsEnum, 
  IsIn, 
  IsNumber, 
  IsOptional, 
  IsString, 
  IsUUID 
} from 'class-validator';

// 1. Enum para definir o tipo de ordenação
export enum RouteOrderType {
  DISTANCE = 'DISTANCE',
  PRIORITY = 'PRIORITY',
}

// 2. DTO para Otimizar a Rota
export class OptimizeRouteDto {
  @IsArray()
  @IsUUID('4', { each: true }) // Garante que são IDs válidos do banco
  taskIds: string[]; 

  @IsNumber()
  driverLatitude: number; 

  @IsNumber()
  driverLongitude: number;

  @IsOptional()
  @IsEnum(RouteOrderType)
  orderBy?: RouteOrderType; // Opcional: Se não enviar, usa DISTANCE por padrão no service
}

// 3. DTO para Finalizar a Tarefa (Visita)
export class FinalizeTaskDto {
  @IsString()
  @IsIn(['COMPLETED', 'FAILED']) // Trava para aceitar apenas esses status
  status: 'COMPLETED' | 'FAILED';

  @IsString()
  @IsOptional()
  finalComment?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string; // Usado para reagendamento

  @IsOptional()
  @IsDateString()
  dueDate?: string; // Usado para definir nova data de vencimento, se necessário
}