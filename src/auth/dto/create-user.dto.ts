/* eslint-disable prettier/prettier */
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  name: string;

  @IsUUID()
  companyId: string;

  @IsOptional()
  role?: UserRole;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsBoolean()
  isProfessional?: boolean;

  @IsOptional()
  @IsString()
  professionalRole?: string;
}