/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordService } from './reset-password.service';
import { Public } from 'src/auth/public.decorator';

@Controller('password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  /**
   * FORGOT PASSWORD
   * Rota: POST /password/forgot
   */
  @Public()
  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // Chama o serviço (que agora tem logs)
    await this.passwordService.forgotPassword(dto.email);

    return {
      message:
        'Se o email estiver cadastrado, você receberá instruções para redefinir sua senha.',
    };
  }

  /**
   * RESET PASSWORD
   * Rota: POST /password/reset
   */
  @Post('reset')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordService.resetPassword(dto.token, dto.password);

    return {
      message: 'Senha redefinida com sucesso.',
    };
  }
}