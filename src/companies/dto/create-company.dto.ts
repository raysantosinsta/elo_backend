/* eslint-disable prettier/prettier */
import { SimpleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/**
 * DTO para Criação de Empresa
 * Focado em sanidade de dados e integridade.
 */
export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'CNPJ é obrigatório' })
  @IsString()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve conter exatamente 14 números' })
  cnpj: string;

  @IsNotEmpty({ message: 'E-mail é obrigatório' })
  @IsEmail({}, { message: 'E-mail em formato inválido' })
  email: string;

  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @IsString()
  telefone: string;

  @IsNotEmpty()
  @IsString()
  endereco: string;

  @IsNotEmpty()
  @IsString()
  numero: string;

  @IsOptional()
  @IsString()
  complemento?: string;

  @IsNotEmpty()
  @IsString()
  bairro: string;

  @IsNotEmpty()
  @IsString()
  cidade: string;

  @IsNotEmpty()
  @IsString()
  estado: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'CEP deve conter exatamente 8 números' })
  cep: string;

  @IsOptional()
  @IsString()
  ramoAtividade?: string;

  @IsOptional()
  @IsEnum(SimpleStatus, { message: 'Status inválido' })
  status?: SimpleStatus;

  // SEGURANÇA: userCreateId removido. Injeção automática via PrismaService.
}

/**
 * DTO para Atualização de Empresa
 * Herda as validações do Create, mas torna tudo opcional.
 */
export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  // SEGURANÇA: userUpdateId removido. Injeção automática via PrismaService.
}

/**
 * DTO para Paginação
 * Garante que os valores de Query String sejam convertidos corretamente.
 */
export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number) // Converte string da URL para Number
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number) // Converte string da URL para Number
  limit?: number = 10;
}
