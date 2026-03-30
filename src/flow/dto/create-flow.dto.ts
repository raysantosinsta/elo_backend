/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  IsEnum,
  IsBooleanString,
  IsInt,
  IsArray,
  Min,
  Max,
  IsDate,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum DateFilterType {
  PRODUCTION_STARTED = 'productionStartedAt',
  DUE_DATE = 'dueDate',
}

export class CreateFlowDto {
  @ApiProperty({ example: 'Coleção Verão 2025' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '#D35400', required: false })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  deadline?: string;
}

// ===========================================================================
// 🔥 DTOs PARA ETAPAS COM PRAZO SUGERIDO
// ===========================================================================

export class CreateStageDto {
  @ApiProperty({ example: 'Modelagem', description: 'Nome da etapa' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsUUID()
  flowId?: string;

  @ApiProperty({ example: '#2C3E50', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false, description: 'Ordem da etapa no fluxo' })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiProperty({
    required: false,
    description: 'Cargo técnico necessário para mover itens (ex: "modelista")',
  })
  @IsOptional()
  @IsString()
  allowedRole?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDays?: number; // 🔥 NOVO CAMPO
}

export class UpdateStageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  allowedRole?: string;

  @ApiProperty({
    required: false,
    description: 'Prazo sugerido em dias (template para novos itens)',
    example: 3,
    minimum: 0,
    maximum: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  suggestedDeadline?: number;
}

// ===========================================================================
// 🔥 NOVOS DTOs PARA GESTÃO DE PRAZOS POR ETAPA
// ===========================================================================

export class UpdateItemStageDeadlineDto {
  @ApiProperty({
    required: false,
    description: 'Prazo sugerido para a etapa',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  suggestedDeadline?: Date;

  @ApiProperty({
    required: false,
    description: 'Prazo real da etapa (quando foi concluída)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  actualDeadline?: Date;

  @ApiProperty({
    required: false,
    description: 'Status da etapa',
    enum: ['PENDENTE', 'ATUAL', 'CONCLUIDO', 'ATRASADO'],
    example: 'ATUAL',
  })
  @IsOptional()
  @IsString()
  status?: 'PENDENTE' | 'ATUAL' | 'CONCLUIDO' | 'ATRASADO';

  @ApiProperty({
    required: false,
    description: 'Observações sobre a alteração do prazo',
    example: 'Cliente solicitou extensão do prazo',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkUpdateItemStageDto {
  @ApiProperty({
    description: 'ID da etapa',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4') // 🔥 ESPECIFIQUE A VERSÃO DO UUID
  @IsNotEmpty()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim()) // 🔥 LIMPA ESPAÇOS EM BRANCO
  stageId: string;

  @ApiProperty({
    required: false,
    description: 'Prazo sugerido para a etapa',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  suggestedDeadline?: string;

  @ApiProperty({
    required: false,
    description: 'Prazo real da etapa (quando foi concluída)',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  actualDeadline?: string;

  @ApiProperty({
    required: false,
    description: 'Status da etapa',
    enum: ['PENDENTE', 'ATUAL', 'CONCLUIDO', 'ATRASADO'],
    example: 'CONCLUIDO',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    required: false,
    description: 'Observações sobre a alteração',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkUpdateItemStagesDto {
  @ApiProperty({
    type: [BulkUpdateItemStageDto],
    description: 'Lista de atualizações de prazos',
  })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true }) // 🔥 CRUCIAL: valida cada item do array
  @Type(() => BulkUpdateItemStageDto) // 🔥 CRUCIAL: transforma para a classe correta
  updates: BulkUpdateItemStageDto[];
}

export class ItemStageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  stageId: string;

  @ApiProperty()
  stageName: string;

  @ApiProperty()
  stageOrder: number;

  @ApiProperty()
  stageColor: string;

  @ApiProperty({ required: false })
  suggestedDeadline?: Date;

  @ApiProperty()
  deadline: Date;

  @ApiProperty({ required: false })
  actualDeadline?: Date;

  @ApiProperty()
  status: string;

  @ApiProperty({ required: false })
  notes?: string;

  @ApiProperty()
  changedAt: Date;

  @ApiProperty({ required: false })
  changedBy?: string;

  @ApiProperty()
  isCurrentStage: boolean;

  @ApiProperty()
  canEdit: boolean;

  @ApiProperty({ required: false })
  daysRemaining?: number;

  @ApiProperty({ required: false })
  isOverdue?: boolean;
}

// ===========================================================================
// 🔥 DTO PARA MOVER ITEM COM ATUALIZAÇÃO DE PRAZO
// ===========================================================================

export class MoveItemWithDeadlineDto {
  @ApiProperty({
    description: 'ID da etapa de destino',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  newStageId: string;

  @ApiProperty({
    required: false,
    description: 'Nova ordem dentro da etapa',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  newOrder?: number;

  @ApiProperty({
    required: false,
    description: 'ID do responsável (funcionário)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  selectedResponsibleId?: string;

  @ApiProperty({
    required: false,
    description: 'ID do fornecedor/oficina',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  selectedSupplierId?: string;

  @ApiProperty({
    required: false,
    description: 'Nova quantidade (se aplicável)',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  newQuantity?: number;
}

// ===========================================================================
// 🔥 DTO PARA RECALCULAR PRAZOS
// ===========================================================================

export class RecalculateDeadlinesDto {
  @ApiProperty({
    description: 'Lista de IDs dos itens para recalcular',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  itemIds?: string[];

  @ApiProperty({
    description: 'Recalcular todos os itens do fluxo',
    example: false,
  })
  @IsOptional()
  @IsBooleanString()
  allItems?: string;
}

// ===========================================================================
// 🔥 DTOs DE ITEM ATUALIZADOS
// ===========================================================================

export class CreateFlowItemDto {
  @ApiProperty({ example: 'Camisa Social Azul' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false, example: 'PED-2024-001' })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiProperty({ required: false, example: 'REF-12345' })
  @IsOptional()
  @IsString()
  productRef?: string;

  @ApiProperty({ required: false, example: 5, minimum: 0 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiProperty({ required: false, example: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
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

  @ApiProperty({
    required: false,
    description: 'ID da etapa onde o item será criado (opcional)',
  })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiProperty({
    required: false,
    description: 'ID do fornecedor/oficina',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({
    required: false,
    description: 'Status do item',
    example: 'PENDENTE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'ID do fluxo relacionado' })
  @IsUUID()
  flowId: string;
}

export class UpdateFlowItemDto {
  @ApiProperty({ required: false, example: 'Camisa Social Azul - Alterada' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false, example: 'PED-2024-001' })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiProperty({ required: false, example: 'REF-12345' })
  @IsOptional()
  @IsString()
  productRef?: string;

  @ApiProperty({
    required: false,
    example: 5,
    description: 'Quantidade do item (mínimo 1)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiProperty({ required: false, example: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeImageIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeVideoIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeAudioIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  flowId?: string; // 🔥 ADICIONE ESTA LINHA
}

// ===========================================================================
// 🔥 DTOs DE FILTRO ATUALIZADOS
// ===========================================================================

export class FlowFilterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    required: false,
    enum: DateFilterType,
    description: 'Tipo de data para filtrar',
  })
  @IsOptional()
  @IsEnum(DateFilterType)
  dateType?: DateFilterType;

  @ApiPropertyOptional({ description: 'Filtrar itens atrasados' })
  @IsOptional()
  @IsBooleanString() // 🔥 USAR IsBooleanString para aceitar "true"/"false" como string
  isOverdue?: string;

  @ApiPropertyOptional({ description: 'Filtrar itens próximos' })
  @IsOptional()
  @IsBooleanString() // 🔥 USAR IsBooleanString
  isUpcoming?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    required: false,
    description: 'Filtrar por nome da coluna (stage)',
  })
  @IsOptional()
  @IsString()
  stageName?: string;

  @ApiProperty({
    required: false,
    description: 'Filtrar por referência do produto',
  })
  @IsOptional()
  @IsString()
  productRef?: string;

  // 🔥 NOVOS FILTROS PARA PRAZOS
  @ApiProperty({
    required: false,
    description: 'Filtrar por data mínima de prazo',
  })
  @IsOptional()
  @IsDateString()
  deadlineFrom?: string;

  @ApiProperty({
    required: false,
    description: 'Filtrar por data máxima de prazo',
  })
  @IsOptional()
  @IsDateString()
  deadlineTo?: string;

  @ApiProperty({
    required: false,
    description: 'Filtrar itens sem prazo definido',
  })
  @IsOptional()
  @IsBooleanString()
  hasNoDeadline?: string;
}

// ===========================================================================
// 🔥 DTOs PARA DASHBOARD DE PRAZOS
// ===========================================================================

export class DeadlineDashboardQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  flowId?: string;

  @ApiProperty({
    required: false,
    enum: ['today', 'week', 'month', 'all'],
    default: 'week',
  })
  @IsOptional()
  @IsString()
  period?: 'today' | 'week' | 'month' | 'all';
}

export class DeadlineStatsDto {
  @ApiProperty()
  totalActive: number;

  @ApiProperty()
  overdue: number;

  @ApiProperty()
  dueToday: number;

  @ApiProperty()
  dueThisWeek: number;

  @ApiProperty()
  byFlow: Record<string, number>;

  @ApiProperty()
  byResponsible: Record<string, number>;

  @ApiProperty({ required: false })
  byStage?: Record<string, number>;

  @ApiProperty({ required: false })
  averageDeadline?: number;
}

export class DeadlineTimelineItemDto {
  @ApiProperty()
  itemId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ required: false })
  productRef?: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ required: false })
  flowName?: string;

  @ApiProperty({ required: false })
  flowColor?: string;

  @ApiProperty({ required: false })
  currentStage?: string;

  @ApiProperty({ required: false })
  currentDeadline?: Date;

  @ApiProperty({ required: false })
  assignedTo?: string;

  @ApiProperty({ required: false })
  supplier?: string;

  @ApiProperty({
    type: 'array',
    description: 'Timeline de prazos por etapa',
  })
  timeline: {
    stageId: string;
    stageName: string;
    stageOrder: number;
    deadline: Date;
    isCurrentStage: boolean;
    daysRemaining: number | null;
    isOverdue: boolean;
  }[];
}

export class DeadlineDashboardResponseDto {
  @ApiProperty()
  stats: DeadlineStatsDto;

  @ApiProperty({ type: [DeadlineTimelineItemDto] })
  deadlines: DeadlineTimelineItemDto[];
}
