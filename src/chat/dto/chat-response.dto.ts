/* eslint-disable prettier/prettier */
export class ChatResponseDto {
  id: string;
  companyId?: string;
  createdAt: Date;
  messages?: any[]; // Array de mensagens (ChatMessageResponseDto ou similar)

  constructor(data: any) {
    Object.assign(this, data);
  }
}