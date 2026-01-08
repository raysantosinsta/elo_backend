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

  constructor(private readonly companiesService: CompaniesService) {}

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
  @Roles(UserRole.MASTER) // 🔒 Bloqueado para Admin
  @ApiOperation({ summary: 'Atualiza dados de uma empresa (Apenas MASTER)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: User,
  ): Promise<Company> {
    return this.companiesService.update(id, updateCompanyDto, user.role);
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
  @Roles(UserRole.MASTER, UserRole.ADMIN) // ✅ Liberado para Admin (para usar no filtro)
  @ApiOperation({ summary: 'Lista empresas (MASTER vê todas, ADMIN vê para filtro)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findAll(
    @Query() pagination: PaginationDto,
    // @CurrentUser() user: User, // Se quiser filtrar no futuro, use isso
  ): Promise<{
    data: Partial<Company>[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    // Admin poderá listar empresas para popular o combobox.
    // Se quiser que o Admin veja APENAS a dele, precisa filtrar aqui ou no service.
    // Por enquanto, liberamos a listagem geral para o filtro funcionar.
    return this.companiesService.findAll(pagination, undefined);
  }

  @Get(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN) // ✅ Liberado para Admin
  @ApiOperation({ summary: 'Busca uma empresa por ID' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }
}