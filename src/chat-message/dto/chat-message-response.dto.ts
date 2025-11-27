/* eslint-disable prettier/prettier */
export class ChatMessageResponseDto {
  id!: string;
  chatId?: string;
  senderId!: string;
  message!: string;
  mentionedProfessionalId?: string;
  createdAt!: Date;
  sender?: any; // User simplificado
  mentionedProfessional?: any; // User simplificado

  constructor(partial: Partial<ChatMessageResponseDto>) {
    Object.assign(this, partial);
  }
}