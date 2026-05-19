/* eslint-disable prettier/prettier */
import { PartialType } from '@nestjs/swagger';
import { CreateInstanceDto } from './create-whatsapp-connection.dto';

export class UpdateWhatsappConnectionDto extends PartialType(
  CreateInstanceDto,
) {}
