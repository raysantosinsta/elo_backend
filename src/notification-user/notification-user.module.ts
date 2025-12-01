/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { NotificationUserGateway } from './notification-user.gateway';

@Module({
  providers: [NotificationUserGateway],
  exports: [NotificationUserGateway],
})
export class NotificationUserModule {}