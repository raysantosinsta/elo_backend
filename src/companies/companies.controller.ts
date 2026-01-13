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
  UseGuards,
  UseInterceptors // <--- Importante
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { Company, UserRole } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor'; // <--- Importe seu interceptor
import {
  CompaniesService,
  CreateCompanyDto,
  PaginationDto,
  UpdateCompanyDto,
} from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor) // 🔥 ATIVA O CONTEXTO AUTOMÁTICO (CLS)
@Controller('companies')
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(private readonly companiesService: CompaniesService) { }

  // --- ESCRITA (Apenas MASTER) ---

  @Post()
  @Roles(UserRole.MASTER)
  @ApiOperation({ summary: 'Cria uma nova empresa (Apenas MASTER)' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentUser() user: User, // Mantive apenas para o log abaixo
  ): Promise<Company> {
    this.logger.log(
      `MASTER ${user.id} criando empresa: ${createCompanyDto.cnpj}`,
    );
    
    // 🔥 MUDANÇA: Não precisamos mais setar userCreateId manualmente.
    // O Service pega o ID do contexto (CLS) automaticamente.
    
    return this.companiesService.create(createCompanyDto);
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza dados (ADMIN só altera a própria)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    // @CurrentUser() user: User, -> Não precisa mais injetar aqui
  ): Promise<Company> {
    // 🔥 O Service já sabe quem é o usuário pelo contexto
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @Roles(UserRole.MASTER)
  @ApiOperation({ summary: 'Inativa (Soft Delete) uma empresa (Apenas MASTER)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    // @CurrentUser() user: User -> Não precisa mais injetar aqui
  ): Promise<void> {
    // 🔥 O Service valida a permissão via contexto
    await this.companiesService.remove(id);
  }

  // --- LEITURA (MASTER e ADMIN) ---

  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista empresas (MASTER vê todas, ADMIN vê apenas a sua)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findAll(
    @Query() pagination: PaginationDto,
    // @CurrentUser() user: User, -> Removido
  ): Promise<{
    data: Partial<Company>[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    // 🔥 O Service aplica o filtro "WHERE companyId" automaticamente se não for Master
    return this.companiesService.findAll(pagination);
  }

  @Get(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Busca uma empresa (Com trava de segurança para ADMIN)' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string, 
    // @CurrentUser() user: User, -> Removido
  ): Promise<Company> {
    // 🔥 O Service valida se o ID pertence ao contexto do usuário
    return this.companiesService.findOne(id);
  }
}