/* eslint-disable prettier/prettier */
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { SimpleStatus, UserRole } from '@prisma/client';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsEnum(SimpleStatus)
  @IsOptional()
  status?: SimpleStatus;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}