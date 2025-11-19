/* eslint-disable prettier/prettier */
// auth/dto/create-user.dto.ts
import { UserRole } from '@prisma/client';
import { IsEmail, IsString, IsOptional, MinLength, IsUUID, IsEnum, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsString()
  contact: string;
}