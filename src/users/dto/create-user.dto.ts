/* eslint-disable prettier/prettier */
import { SimpleStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

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
  professionalRole?: string;

  @IsString()
  contact: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsEnum(SimpleStatus)
  @IsOptional()
  status?: SimpleStatus;

}