import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  Length,
  IsUUID,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { SimpleStatus } from '@prisma/client';

export class CreateCompanyRoleDto {
  @ApiProperty({
    description: 'Nome do cargo',
    example: 'Coordenador de Produção',
  })
  @IsString()
  @Length(3, 100)
  name: string;

  @ApiProperty({
    description: 'Descrição do cargo',
    required: false,
    example: 'Responsável pela coordenação da produção',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Nível hierárquico (1-100)',
    required: false,
    default: 1,
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  level?: number;
}

export class UpdateCompanyRoleDto extends PartialType(CreateCompanyRoleDto) {
  @ApiProperty({
    description: 'Status do cargo',
    required: false,
    enum: SimpleStatus,
  })
  @IsOptional()
  @IsString()
  status?: SimpleStatus;
}

export class CompanyRoleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  level: number;

  @ApiProperty()
  status: SimpleStatus;

  @ApiProperty()
  companyId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  userCreateId?: string;

  @ApiProperty({ required: false })
  userUpdateId?: string;
}

export class PaginatedRolesResponse {
  @ApiProperty({ type: [CompanyRoleResponseDto] })
  data: CompanyRoleResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  lastPage: number;
}

export class AssignRoleToUserDto {
  @ApiProperty({ description: 'ID do usuário' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'ID do cargo' })
  @IsUUID()
  roleId: string;
}
