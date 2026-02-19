/* eslint-disable prettier/prettier */
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  IsEnum,
  IsBooleanString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DateFilterType {
  PRODUCTION_STARTED = 'productionStartedAt',
  DUE_DATE = 'dueDate',
}



export class CreateFlowDto {
  @ApiProperty({ example: 'Coleção Verão 2025' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '#D35400', required: false }) // 🔥 Adicionado para o Swagger
  @IsString()
  @IsOptional()
  color?: string; // 🔥 Campo de cor adicionado
}

export class CreateStageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsUUID()
  flowId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  order?: number;

  // 🔥 NOVO CAMPO: Cargo permitido para mover card
  @ApiProperty({ 
    required: false, 
    description: 'Cargo técnico necessário para mover itens desta etapa (ex: "modelista")' 
  })
  @IsOptional()
  @IsString()
  allowedRole?: string;
}

export class CreateFlowItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  productRef?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueDate?: string | Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  productionStartedAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  deliveryAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  // --- ADICIONE ISTO AQUI EMBAIXO ---
  @ApiProperty({
    required: false,
    description: 'ID da etapa onde o item será criado',
  })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string; // <--- Novo campo para salvar a oficina

   @IsOptional()
  @IsString()
  status?: string; // Adicione se o Flow tiver um status



  @ApiProperty({ description: 'ID do fluxo relacionado', required: false })
  @IsUUID()        // Se for um UUID, use IsUUID, caso contrário use IsString
  @IsOptional()
  flowId?: string;

}

export class FlowFilterDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  productRef?: string; // 🔥 NOVO: Filtro por referência do produto

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsEnum(DateFilterType)
  dateType?: DateFilterType;

  @IsOptional()
  @IsBooleanString()
  isOverdue?: string;

  @IsOptional()
  @IsBooleanString()
  isUpcoming?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
