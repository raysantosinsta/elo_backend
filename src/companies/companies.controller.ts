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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { Company } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CompaniesService, CreateCompanyDto, PaginationDto, UpdateCompanyDto } from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentUser() user: User
  ): Promise<Company> {
    this.logger.log(`Solicitação de criação de empresa: ${createCompanyDto.cnpj} pelo user ${user.id}`);
    createCompanyDto.userCreateId = user.id;
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista empresas (MASTER vê todas, outros veem as que criaram)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: User
  ): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {
    
    // CORREÇÃO CRÍTICA AQUI:
    // Se for MASTER, passamos undefined para listar TUDO.
    // Se for outro perfil, passamos o ID para listar apenas as que ele criou.
    const filterByUserId = user.role === 'MASTER' ? undefined : user.id;

    return this.companiesService.findAll(pagination, filterByUserId); 
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma empresa por ID' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados de uma empresa' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: User 
  ): Promise<Company> {
    return this.companiesService.update(id, updateCompanyDto, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativa (Soft Delete) uma empresa' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.companiesService.remove(id);
  }
}