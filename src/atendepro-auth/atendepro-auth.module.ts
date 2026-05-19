import { Module } from '@nestjs/common';
import { AtendeProAuthService } from './atendepro-auth.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [AtendeProAuthService],
  exports: [AtendeProAuthService],
})
export class AtendeproAuthModule {}
