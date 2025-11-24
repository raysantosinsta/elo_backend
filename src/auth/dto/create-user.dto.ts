/* eslint-disable prettier/prettier */
export class CreateUserDto {
  email: string;
  password: string;
  name: string;
  companyId: string;
  role?: string;
  phone?: string;
  document?: string; // Novo campo
}