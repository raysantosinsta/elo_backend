/* eslint-disable prettier/prettier */
// dto/update-company-notification.dto.ts
import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCompanyNotificationDto {
  @ApiProperty({
    description: 'Dias de antecedência para notificações de vencimento',
    example: 7,
    minimum: 1,
    maximum: 90,
  })
  @IsInt({ message: 'O campo notificationDays deve ser um número inteiro' })
  @Min(1, { message: 'O valor mínimo para notificationDays é 1' })
  @Max(90, { message: 'O valor máximo para notificationDays é 90' })
  notificationDays: number;
}