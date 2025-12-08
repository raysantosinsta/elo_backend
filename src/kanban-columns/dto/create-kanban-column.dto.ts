import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested, IsUUID, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKanbanColumnDto {
  @ApiProperty({ example: 'Em Progresso', description: 'Título da coluna' })
  @IsString()
  @IsNotEmpty()
  title: string;
}

export class UpdateKanbanColumnDto {
  @ApiProperty({ example: 'Em Progresso', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiProperty({ example: 'Tarefas sendo trabalhadas', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ColumnOrderDto {
  @IsUUID()
  id: string;

  @IsNumber()
  order: number;
}

export class ReorderColumnsDto {
  @ApiProperty({ type: [ColumnOrderDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnOrderDto)
  columns: ColumnOrderDto[];
}