/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'; // Para documentação (DevEx)
import { Company, type User } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CompaniesService, CreateCompanyDto, PaginationDto, UpdateCompanyDto } from './companies.service';

@ApiTags('Companies') // Agrupa no Swagger
@Controller('companies')
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * POST /companies
   * Criação com validação estrita (DTO).
   */
  @Post()
  @ApiOperation({ summary: 'Cria uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou CNPJ duplicado.' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCompanyDto: CreateCompanyDto): Promise<Company> {
    this.logger.log(`Solicitação de criação de empresa recebida: ${createCompanyDto.cnpj}`);
    return this.companiesService.create(createCompanyDto);
  }

  /**
   * GET /companies
   * Listagem paginada para escalabilidade e controle de banda.
   */
  @Get()
  @ApiOperation({ summary: 'Lista empresas com paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Lista retornada com metadados de paginação.' })
  async findAll(@Query() pagination: PaginationDto): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {
    // O Service já trata os defaults se pagination for vazio
    return this.companiesService.findAll(pagination);
  }

  /**
   * GET /companies/:id
   * Busca por ID com validação de UUID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Busca uma empresa por ID' })
  @ApiResponse({ status: 200, description: 'Empresa encontrada.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  @ApiResponse({ status: 400, description: 'ID inválido (não é UUID).' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  /**
   * PATCH /companies/:id
   * Atualização com RBAC Real via Token JWT
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados de uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa atualizada.' })
  @ApiResponse({ status: 403, description: 'Proibido: Permissão insuficiente.' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: User // <--- AQUI ESTÁ A MÁGICA: O Nest injeta o usuário logado
  ): Promise<Company> {
    
    this.logger.log(`Usuário ${user.id} (Role: ${user.role}) tentando atualizar empresa ${id}`);
    
    // Passamos a role real do usuário extraído do Token
    return this.companiesService.update(id, updateCompanyDto, user.role);
  }

  /**
   * DELETE /companies/:id
   * Soft Delete com retorno 204 No Content.
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Inativa (Soft Delete) uma empresa' })
  @ApiResponse({ status: 204, description: 'Empresa inativada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    // O Service agora retorna void e faz apenas o update de status
    await this.companiesService.remove(id);
    // O NestJS envia automaticamente o status 204 e corpo vazio quando retorna void
  }
}