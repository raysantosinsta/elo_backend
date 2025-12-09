/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@prisma/client';
import { 
  IsEmail, 
  IsEnum, 
  IsNotEmpty, 
  IsOptional, 
  IsString, 
  Length, 
  MaxLength 
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ 
    description: 'Razão Social ou Nome Fantasia', 
    example: 'Confecções Silva Ltda',
    maxLength: 150 
  })
  @IsNotEmpty({ message: 'O nome da empresa é obrigatório.' })
  @IsString()
  @MaxLength(150, { message: 'O nome deve ter no máximo 150 caracteres.' })
  name: string;

  @ApiProperty({ 
    description: 'CNPJ da empresa (formatado ou apenas números)', 
    example: '12.345.678/0001-90',
    maxLength: 18
  })
  @IsNotEmpty({ message: 'O CNPJ é obrigatório.' })
  @IsString()
  // Nota: A limpeza de caracteres não numéricos geralmente é feita no Service ou Controller antes de salvar
  @MaxLength(18, { message: 'O CNPJ deve ter no máximo 18 caracteres.' })
  cnpj: string;

  @ApiProperty({ 
    description: 'E-mail corporativo principal', 
    example: 'contato@empresa.com',
    maxLength: 255
  })
  @IsNotEmpty({ message: 'O e-mail é obrigatório.' })
  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ 
    description: 'Telefone ou WhatsApp de contato', 
    example: '(11) 99999-9999',
    maxLength: 20
  })
  @IsNotEmpty({ message: 'O telefone é obrigatório.' })
  @IsString()
  @MaxLength(20)
  telefone: string;

  // --- Endereço ---

  @ApiProperty({ description: 'CEP', example: '01001-000', maxLength: 9 })
  @IsNotEmpty({ message: 'O CEP é obrigatório.' })
  @IsString()
  @MaxLength(9)
  cep: string;

  @ApiProperty({ description: 'Logradouro (Rua, Av, etc)', example: 'Avenida Paulista', maxLength: 300 })
  @IsNotEmpty({ message: 'O endereço é obrigatório.' })
  @IsString()
  @MaxLength(300)
  endereco: string;

  @ApiProperty({ description: 'Número do endereço', example: '1000', maxLength: 10 })
  @IsNotEmpty({ message: 'O número é obrigatório.' })
  @IsString()
  @MaxLength(10)
  numero: string;

  @ApiPropertyOptional({ description: 'Complemento do endereço', example: 'Sala 42, Bloco B', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @ApiProperty({ description: 'Bairro', example: 'Bela Vista', maxLength: 100 })
  @IsNotEmpty({ message: 'O bairro é obrigatório.' })
  @IsString()
  @MaxLength(100)
  bairro: string;

  @ApiProperty({ description: 'Cidade', example: 'São Paulo', maxLength: 100 })
  @IsNotEmpty({ message: 'A cidade é obrigatória.' })
  @IsString()
  @MaxLength(100)
  cidade: string;

  @ApiProperty({ description: 'Sigla do Estado (UF)', example: 'SP', minLength: 2, maxLength: 2 })
  @IsNotEmpty({ message: 'O estado é obrigatório.' })
  @IsString()
  @Length(2, 2, { message: 'O estado deve ser a sigla de 2 letras (ex: SP).' })
  estado: string;

  // --- Outros ---

  @ApiPropertyOptional({ 
    description: 'Ramo de atividade da empresa', 
    example: 'Confecção de Moda Praia',
    maxLength: 100 
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ramoAtividade?: string;

  @ApiPropertyOptional({ 
    description: 'Status da empresa', 
    enum: CompanyStatus, 
    default: CompanyStatus.ATIVO 
  })
  @IsOptional()
  @IsEnum(CompanyStatus, { message: 'Status inválido. Use ATIVO ou INATIVO.' })
  status?: CompanyStatus;
}