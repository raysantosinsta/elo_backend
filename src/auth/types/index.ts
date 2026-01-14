/* eslint-disable prettier/prettier */
import { SimpleStatus, UserRole, UserStatus } from "@prisma/client";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  companyId: string | null;
  
  document?: string | null;
  contact: string;
  professionalRole?: string | null; 
  company?: {
    id: string;
    name: string;
    status: SimpleStatus;
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

export interface RequestWithUser {
  user: {
    id: string;
    role: UserRole;
    email: string;
    [key: string]: any; // Esse objeto pode ter outras propriedades com chave string, além das que já declarei.
  };
}