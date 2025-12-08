import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatMessageDto {
  @ApiProperty({ description: 'ID do chat onde a mensagem será enviada' })
  @IsUUID()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({ description: 'ID do usuário que está enviando' })
  @IsUUID()
  @IsNotEmpty()
  senderId: string;

  @ApiProperty({ description: 'Conteúdo da mensagem' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ description: 'ID de um profissional mencionado explicitamente', required: false })
  @IsOptional()
  @IsUUID()
  mentionedProfessionalId?: string;
}