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
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFlowDto {
  @ApiProperty({ example: 'Coleção Verão 2025' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '#D35400', required: false }) // 🔥 Adicionado para o Swagger
  @IsString()
  @IsOptional()
  color?: string; // 🔥 Campo de cor adicionado

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class CreateStageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

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
}

// Crie o DTO de Filtro (Novo)
export class FlowFilterDto {
  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;

  @IsOptional()
  @IsEnum(['dueDate', 'productionStartedAt', 'deliveryAt', 'enteredAt'])
  dateField?: 'dueDate' | 'productionStartedAt' | 'deliveryAt' | 'enteredAt';

  @IsOptional()
  onlyOutsourced?: string; // Chega como string 'true' ou 'false' via query param
}
