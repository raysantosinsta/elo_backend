/* eslint-disable prettier/prettier */
export class CreateChatMessageDto {
  chatId?: string;
  senderId: string;
  message: string;
  mentionedProfessionalId?: string;
}