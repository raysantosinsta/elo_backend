/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { SimpleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';

// --- DTOs (Mantidos) ---
export class CreateCompanyDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() cnpj: string;
  @IsNotEmpty() @IsString() telefone: string;
  @IsNotEmpty() @IsEmail() email: string;
  @IsNotEmpty() @IsString() endereco: string;
  @IsNotEmpty() @IsString() numero: string;
  @IsOptional() @IsString() complemento?: string;
  @IsNotEmpty() @IsString() bairro: string;
  @IsNotEmpty() @IsString() cidade: string;
  @IsNotEmpty() @IsString() estado: string;
  @IsNotEmpty() @IsString() cep: string;
  @IsOptional() @IsString() ramoAtividade?: string;
  @IsOptional() @IsUUID() userCreateId?: string;
  @IsOptional() @IsEnum(SimpleStatus) status?: SimpleStatus;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() ramoAtividade?: string;
  @IsOptional() @IsUUID() userUpdateId?: string;
  @IsOptional() @IsEnum(SimpleStatus) status?: SimpleStatus;
}

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number) // <--- Converte "1" para 1
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100) // Mantido como você pediu
  @Type(() => Number) // <--- Converte "100" para 100
  limit?: number;
}