/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export function validateFiles(files: {
  images?: any[];
  audios?: any[];
  videos?: any[];
}) {
  // Regex segura e permissiva
  const allowedMimesRegex = /(jpg|jpeg|png|webp|gif|mpeg|mp3|wav|ogg|m4a|mp4|webm|quicktime|mov|avi|x-msvideo|octet-stream)/;

  // Junta todos os arquivos em um único array para validar um por um
  const allFiles = [
    ...(files.images || []),
    ...(files.audios || []),
    ...(files.videos || []),
  ];

  for (const file of allFiles) {
    // Verifica se o mimetype contém alguma das palavras permitidas
    if (!allowedMimesRegex.test(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo inválido: ${file.originalname} (${file.mimetype}). Tipos permitidos: Imagens, Áudios e Vídeos comuns.`,
      );
    }
    
    // Validação de tamanho extra (ex: 100MB)
    const maxSize = 100 * 1024 * 1024; 
    if (file.size > maxSize) {
       throw new BadRequestException(
        `Arquivo muito grande: ${file.originalname}. Máximo permitido: 100MB.`,
      );
    }
  }
}

export class CreateTaskAddressDto {
  @IsString() @IsNotEmpty() cep: string;
  @IsString() @IsNotEmpty() endereco: string;
  @IsString() @IsNotEmpty() numero: string;
  @IsString() @IsNotEmpty() bairro: string;
  @IsString() @IsNotEmpty() cidade: string;
  @IsString() @IsNotEmpty() estado: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
}

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() @IsNotEmpty() columnId: string;
  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsUUID() assignedToId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => CreateTaskAddressDto)
  address?: CreateTaskAddressDto;

  @IsOptional() @IsString() finalComment?: string;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsInt() @Type(() => Number) priority?: number;
  @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
  @IsOptional() @IsUUID() routeId?: string;
  
  @IsOptional() status?: any;
  @IsOptional() images?: any;
  @IsOptional() audios?: any;
  @IsOptional() videos?: any;
  @IsOptional() companyId?: string;
  @IsOptional() createdById?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() columnId?: string;
  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsInt() @Type(() => Number) priority?: number;
  @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
  @IsOptional() @IsUUID() assignedToId?: string | null;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() finalComment?: string;
  @IsOptional() @IsUUID() completedById?: string;

  // --- CAMPO QUE FALTAVA ---
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => CreateTaskAddressDto)
  address?: CreateTaskAddressDto;
  // -------------------------

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeImageIds?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeAudioIds?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeVideoIds?: string[];

  @IsOptional() images?: any;
  @IsOptional() audios?: any;
  @IsOptional() videos?: any;
}

export class FinalizeTaskDto {
  @IsEnum(TaskStatus) status: TaskStatus;
  @IsOptional() @IsString() finalComment: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}