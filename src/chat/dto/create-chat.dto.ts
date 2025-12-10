// src/chat/dto/create-chat.dto.ts
import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatDto {
  // Marcamos como opcional porque o Frontend NÃO DEVE enviar isso.
  // Quem preenche isso é o Controller pegando do Token (req.user).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}