/* eslint-disable prettier/prettier */
// auth/types/index.ts
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  companyId?: string;
  createdAt?: Date;
  company?: {
    id: string;
    name: string;
    status: string;
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  companyId?: string;
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