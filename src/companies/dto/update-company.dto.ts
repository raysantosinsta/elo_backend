// src/companies/dto/update-company.dto.ts

// IMPORTANTE: Use '@nestjs/swagger' se você usa Swagger, ou '@nestjs/mapped-types' se não usar.
// Como seu CreateCompanyDto tem @ApiProperty, use o do Swagger:
import { PartialType } from '@nestjs/swagger'; 
import { CreateCompanyDto } from './create-company.dto';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
    // Não precisa adicionar nada aqui. 
    // O PartialType automaticamente torna todos os campos do Create (name, cnpj, etc) em OPCIONAIS.
}