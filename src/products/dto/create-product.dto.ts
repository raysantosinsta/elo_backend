/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { 
  IsString, 
  IsOptional, 
  IsNumber, 
  IsArray, 
  ValidateNested, 
  IsUUID,
  Min
} from 'class-validator';

export class ProductMaterialDto {
  @ApiProperty({ description: 'ID do Material' })
  @IsUUID()
  materialId: string;

  @ApiProperty({ description: 'Quantidade utilizada' })
  @IsNumber()
  @Min(0)
  quantidade: number;
}

export class CreateProductDto {
  @ApiProperty({ description: 'Nome do produto' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Referência interna (SKU)' })
  @IsOptional()
  @IsString()
  referece?: string;

  @ApiPropertyOptional({ description: 'Descrição detalhada' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Custo unitário' })
  @IsNumber()
  @Min(0)
  custoUnitario: number;

  @ApiPropertyOptional({ description: 'Faixa de tamanhos (ex: P-GG)' })
  @IsOptional()
  @IsString()
  sizeRange?: string;

  // Permite criar o produto já com materiais vinculados
  @ApiPropertyOptional({ type: [ProductMaterialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMaterialDto)
  materials?: ProductMaterialDto[];
}