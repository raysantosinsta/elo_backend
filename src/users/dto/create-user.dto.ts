/* eslint-disable prettier/prettier */
import { SimpleStatus, UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

;

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  professionalRole?: string;  // 🔥 Para receber o NOME do cargo

  @IsOptional()
  @IsString()
  professionalRoleId?: string; // 🔥 NOVO: Para receber o ID diretamente

  @IsOptional()
  @IsString()
  companyRoleId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsString()
  contact: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsEnum(SimpleStatus)
  @IsOptional()
  status?: SimpleStatus;
}
