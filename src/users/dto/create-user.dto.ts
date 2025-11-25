/* eslint-disable prettier/prettier */
import { IsEmail, IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

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

  @IsEnum(UserRole)
  role: UserRole;

  @IsBoolean()
  @IsOptional()
  isProfessional?: boolean;

  @IsOptional()
  @IsString()
  professionalRole?: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}