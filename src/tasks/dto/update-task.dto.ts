import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from '../tasks.service';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
