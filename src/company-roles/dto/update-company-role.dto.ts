import { PartialType } from '@nestjs/swagger';
import { CreateCompanyRoleDto } from './create-company-role.dto';

export class UpdateCompanyRoleDto extends PartialType(CreateCompanyRoleDto) {}
