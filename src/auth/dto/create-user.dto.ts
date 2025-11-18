/* eslint-disable prettier/prettier */
// auth/dto/create-user.dto.ts
import { IsEmail, IsString, IsOptional, MinLength, IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsUUID()
  companyId: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  contact: string;
}