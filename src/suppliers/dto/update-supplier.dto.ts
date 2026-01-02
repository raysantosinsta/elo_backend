import { PartialType } from '@nestjs/mapped-types';
import { CreateSupplierDto } from './create-supplier.dto';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @IsOptional()
  @IsUUID()
  userUpdateId?: string;
}