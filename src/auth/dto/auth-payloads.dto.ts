// dto/auth-payloads.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

export class VerifyTokenDto {
  @IsNotEmpty()
  @IsString()
  token: string;
}

// export class DocumentLoginDto {
//   @IsNotEmpty()
//   @IsString()
//   document: string;

//   @IsNotEmpty()
//   @IsString()
//   password: string;
// }