import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Company } from '@prisma/client';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // POST /companies
  // Cria uma nova empresa.
  @Post()
  @HttpCode(HttpStatus.CREATED) // Retorna 201 Created
  create(@Body() createCompanyDto: any): Promise<Company> {
    return this.companiesService.create(createCompanyDto);
  }

  // GET /companies
  // Lista todas as empresas (ativas por padrão, conforme o service).
  @Get()
  findAll(): Promise<Company[]> {
    return this.companiesService.findAll();
  }

  // GET /companies/:id
  // Busca uma empresa específica pelo ID (UUID).
  @Get(':id')
  findOne(@Param('id') id: string): Promise<Company> {
    // IMPORTANTE: Removido o '+' pois o ID é uma STRING (UUID)
    return this.companiesService.findOne(id);
  }

  // PATCH /companies/:id
  // Atualiza parcialmente uma empresa pelo ID (UUID).
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCompanyDto: any): Promise<Company> {
    // IMPORTANTE: Removido o '+' pois o ID é uma STRING (UUID)
    return this.companiesService.update(id, updateCompanyDto);
  }

  // DELETE /companies/:id
  // Remove (ou inativa) uma empresa pelo ID (UUID).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // Retorna 204 No Content para exclusões bem-sucedidas
  remove(@Param('id') id: string): Promise<void> { // Mudança para retornar void ou Promise<Company> (Soft Delete)
    // IMPORTANTE: Removido o '+' pois o ID é uma STRING (UUID)
    // Se o service retorna a empresa excluída (soft delete), mantenha o tipo Promise<Company>
    // Se o service retorna void (hard delete) ou apenas a execução da operação, use Promise<void>
    return this.companiesService.remove(id).then(() => {
      // Retorna 204 No Content se o delete foi bem-sucedido.
    }) as any; // Usando 'as any' para permitir que o 204 funcione corretamente no NestJS, se o service retorna a Company.
  }
}