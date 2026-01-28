/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Tecido' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 'Algodão Cru' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Tecido 100% algodão para tingimento' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Beige' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ example: 'KG', description: 'KG ou METRO' })
  @IsString()
  @IsNotEmpty()
  unitOfMeasure: string;

  @ApiProperty({ example: 4, description: 'Rendimento em metros por KG' })
  @IsInt()
  @Min(0)
  yieldPerKg: number;
}



export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  search?: string; // Adicionei search aqui para facilitar
}