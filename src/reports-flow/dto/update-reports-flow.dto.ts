import { PartialType } from '@nestjs/mapped-types';
import { CreateReportsFlowDto } from './create-reports-flow.dto';

export class UpdateReportsFlowDto extends PartialType(CreateReportsFlowDto) {}
