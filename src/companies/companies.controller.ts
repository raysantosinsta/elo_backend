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
  Query,
  UseGuards // Adicionei para garantir
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Company } from '@prisma/client';
import type { User } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CompaniesService, CreateCompanyDto, PaginationDto, UpdateCompanyDto } from './companies.service';
// Importe seus Guards se não estiverem aplicados globalmente ou na classe
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'; 

@ApiTags('Companies')
@ApiBearerAuth() // Adiciona o botão de autorização global para este controller no Swagger UI
@Controller('companies')
// @UseGuards(JwtAuthGuard) // Se já estiver na classe AuthController ou Global, ok. Se não, ative.
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou CNPJ duplicado.' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentUser() user: User // <--- CORREÇÃO 1: Injeta o usuário logado
  ): Promise<Company> {
    this.logger.log(`Solicitação de criação de empresa: ${createCompanyDto.cnpj} pelo user ${user.id}`);
    
    // <--- CORREÇÃO 2: Vincula a empresa ao usuário que está criando
    createCompanyDto.userCreateId = user.id;

    return this.companiesService.create(createCompanyDto);
  }

  // ... (Mantenha os outros métodos findAll, findOne, update, remove iguais)
  @Get()
  @ApiOperation({ summary: 'Lista empresas com paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Lista retornada com metadados de paginação.' })
  async findAll(@Query() pagination: PaginationDto): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {
    return this.companiesService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma empresa por ID' })
  @ApiResponse({ status: 200, description: 'Empresa encontrada.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  @ApiResponse({ status: 400, description: 'ID inválido (não é UUID).' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados de uma empresa' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto, // <--- Tem que ser o Update, não o Create
    @CurrentUser() user: User 
  ): Promise<Company> {
    return this.companiesService.update(id, updateCompanyDto, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativa (Soft Delete) uma empresa' })
  @ApiResponse({ status: 204, description: 'Empresa inativada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.companiesService.remove(id);
  }
}