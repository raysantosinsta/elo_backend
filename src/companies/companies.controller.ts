/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Company, UserRole } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor';
import { CompaniesService } from './companies.service';
import {
  CreateCompanyDto,
  PaginationDto,
  UpdateCompanyDto,
} from './dto/create-company.dto';
import { UpdateCompanyNotificationDto } from './dto/update-company-notification.dto';

// Interface para garantir o contrato de retorno
interface PaginatedCompaniesResponse {
  data: Partial<Company>[];
  total: number;
  page: number;
  lastPage: number;
}

interface NotificationSettingsResponse {
  notificationDays: number;
}

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Controller('companies')
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles(UserRole.MASTER)
  @ApiOperation({ summary: 'Cria uma nova empresa (Apenas MASTER)' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCompanyDto: CreateCompanyDto): Promise<Company> {
    return this.companiesService.create(createCompanyDto);
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza dados (ADMIN só altera a própria)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ): Promise<Company> {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @Roles(UserRole.MASTER)
  @ApiOperation({
    summary: 'Inativa (Soft Delete) uma empresa (Apenas MASTER)',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.companiesService.remove(id);
  }


  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lista empresas (MASTER vê todas, ADMIN vê apenas a sua)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async findAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedCompaniesResponse> {
    // 🔥 O retorno agora está estritamente tipado
    return this.companiesService.findAll(pagination);
  }

  @Get(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Busca uma empresa (Com trava de segurança para ADMIN)',
  })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Company> {
    return this.companiesService.findOne(id);
  }

   // ===========================================================================
  // 🔥 NOVOS ENDPOINTS PARA CONFIGURAÇÕES DE NOTIFICAÇÃO
  // ===========================================================================

  @Get(':id/notification-settings')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Busca configurações de notificação da empresa',
    description: 'Retorna os dias de antecedência configurados para notificações',
  })
  @ApiResponse({
    status: 200,
    description: 'Configurações encontradas',
    schema: {
      example: {
        notificationDays: 7,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  async getNotificationSettings(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificationSettingsResponse> {
    return this.companiesService.getNotificationSettings(id);
  }

  @Patch(':id/notification-settings')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Atualiza configurações de notificação da empresa',
    description: 'Define com quantos dias de antecedência enviar notificações (1-90 dias)',
  })
  @ApiResponse({
    status: 200,
    description: 'Configurações atualizadas com sucesso',
    schema: {
      example: {
        id: 'uuid',
        name: 'Minha Empresa',
        notificationDays: 14,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (fora do range 1-90)' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  async updateNotificationSettings(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompanyNotificationDto,
  ): Promise<Partial<Company>> {
    return this.companiesService.updateNotificationSettings(id, dto);
  }
}
