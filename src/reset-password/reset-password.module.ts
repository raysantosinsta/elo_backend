/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PasswordService } from './reset-password.service';
import { PasswordController } from './reset-password.controller';
import { MailModule } from 'src/mail/mail.module';

@Module({
 controllers: [PasswordController],
  providers: [PasswordService],
  // 2. Coloque MailModule aqui
  imports: [MailModule],
})
export class ResetPasswordModule {}
