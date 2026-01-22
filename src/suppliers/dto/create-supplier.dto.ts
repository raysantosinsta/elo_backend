/* eslint-disable prettier/prettier */
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { SupplierCategory, SimpleStatus } from '@prisma/client';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  document?: string; // CPF ou CNPJ

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(SupplierCategory)
  @IsOptional()
  category?: SupplierCategory;

  // --- Endereço ---
  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  bairro?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  // --- Geolocalização ---
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : null)) // Garante que venha como número
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : null))
  longitude?: number;

  @IsEnum(SimpleStatus)
  @IsOptional()
  status?: SimpleStatus;
}