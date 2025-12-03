import { PartialType } from '@nestjs/mapped-types';
import { CreateReportsTaskDto } from './create-reports-task.dto';

export class UpdateReportsTaskDto extends PartialType(CreateReportsTaskDto) {}
