import { IsNotEmpty, IsString } from 'class-validator';

// Garante que o sistema receba apenas os campos que você permitiu

/**
 * DTO responsável por receber a requisição de renovação de tokens.
 */
export class RefreshTokenDto {
  /**
   * O token de atualização (refresh token) emitido anteriormente.
   * @example "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   */
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

/**
 * DTO utilizado para validar se um token específico ainda é válido.
 */
export class VerifyTokenDto {
  /**
   * O token de acesso ou identificação que será verificado.
   * @example "eyJhbGciOiJIUzI1NiR5..."
   */
  @IsNotEmpty()
  @IsString()
  token: string;
}