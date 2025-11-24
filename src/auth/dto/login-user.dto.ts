/* eslint-disable prettier/prettier */
export class LoginUserDto {
  email: string;
  password: string;
  document?: string; // Opcional: para login por documento
}