import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SupplierCategory } from '@prisma/client';

export class CreateSupplierDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(SupplierCategory)
  category?: SupplierCategory; // MATERIAL_ONLY, SERVICE_ONLY, HYBRID

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsNotEmpty()
  @IsUUID()
  companyId: string;

  // Em uma aplicação real, isso geralmente vem do Token JWT (req.user.id),
  // mas vamos colocar aqui para funcionar com sua lógica atual.
  @IsNotEmpty()
  @IsUUID()
  userCreateId: string;
}