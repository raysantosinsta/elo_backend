/* eslint-disable prettier/prettier */
import { UserRole, UserStatus } from '@prisma/client';

export class UserResponseDto {
  id: string;
  status: UserStatus;
  name: string;
  email: string;
  document?: string;
  role: UserRole;
  isProfessional: boolean;
  professionalRole?: string;
  phone: string;
  companyId?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}