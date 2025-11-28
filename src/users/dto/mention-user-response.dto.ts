/* eslint-disable prettier/prettier */
export class MentionUserResponseDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  isProfessional: boolean;
  professionalRole?: string;
  company?: {
    id: string;
    name: string;
  };

  constructor(partial: Partial<MentionUserResponseDto>) {
    Object.assign(this, partial);
  }
}