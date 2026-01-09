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
  UseGuards
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
import {
  CompaniesService,
  CreateCompanyDto,
  PaginationDto,
  UpdateCompanyDto,
} from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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
    @CurrentUser() user: User,
  ): Promise<Company> {
    this.logger.log(
      `MASTER ${user.id} criando empresa: ${createCompanyDto.cnpj}`,
    );
    createCompanyDto.userCreateId = user.id;
    return this.companiesService.create(createCompanyDto);
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza dados (ADMIN só altera a própria)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: User,
  ): Promise<Company> {
    return this.companiesService.update(id, updateCompanyDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.MASTER)
  @ApiOperation({ summary: 'Inativa (Soft Delete) uma empresa (Apenas MASTER)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.companiesService.remove(id);
  }

  // --- LEITURA (MASTER e ADMIN) ---

  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN) // ✅ Liberado para Admin (mas o Service garante que ele só vê a dele)
  @ApiOperation({ summary: 'Lista empresas (MASTER vê todas, ADMIN vê apenas a sua)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: User, // 🔥 OBRIGATÓRIO: Injetamos o usuário logado aqui
  ): Promise<{
    data: Partial<Company>[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    // Passamos o usuário para o Service.
    // Lá dentro, o Service vai checar:
    // 1. É MASTER? -> Busca tudo.
    // 2. É ADMIN? -> Busca WHERE id = user.companyId (retorna array com 1 item).
    return this.companiesService.findAll(pagination, user);
  }

  @Get(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN) // ✅ Liberado para Admin
  @ApiOperation({ summary: 'Busca uma empresa (Com trava de segurança para ADMIN)' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User,): Promise<Company> {
    // Passamos o usuário inteiro para o service validar a "posse" do dado
    return this.companiesService.findOne(id, user);
  }
}