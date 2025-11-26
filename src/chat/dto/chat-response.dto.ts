/* eslint-disable prettier/prettier */
export class ChatResponseDto {
  id: string;
  companyId?: string;
  createdAt: Date;

  constructor(data: any) {
    Object.assign(this, data);
  }
}
