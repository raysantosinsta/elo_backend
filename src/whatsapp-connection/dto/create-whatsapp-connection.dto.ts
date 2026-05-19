// src/whatsapp-connection/dto/create-instance.dto.ts

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateInstanceDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório' })
  token!: string;

  @IsString()
  @IsOptional()
  provider?: string = 'beta';
}
