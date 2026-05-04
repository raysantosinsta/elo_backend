import { PartialType } from '@nestjs/swagger';
import { CreateWhatsappNotificationDto } from './create-whatsapp-notification.dto';

export class UpdateWhatsappNotificationDto extends PartialType(CreateWhatsappNotificationDto) {}
