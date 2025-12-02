/* eslint-disable prettier/prettier */
import { CompanyStatus, UserRole, UserStatus } from "@prisma/client";

// auth/types/index.ts
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  companyId: string | null;
  document?: string | null;
  phone: string;
  isProfessional: boolean; // 🔥 ADICIONE ESTA LINHA
  professionalRole?: string | null; // 🔥 ADICIONE ESTA LINHA
  company?: {
    id: string;
    name: string;
    status: CompanyStatus;
  } | null;
  createdAt?: Date;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

export interface UserTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}