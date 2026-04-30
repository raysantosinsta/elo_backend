/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { CompanyRolesService } from './company-roles.service';
import {
  AssignRoleToUserDto,
  CreateCompanyRoleDto,
  UpdateCompanyRoleDto,
} from './dto/create-company-role.dto';

@ApiTags('Company Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Controller('company-roles')
export class CompanyRolesController {
  constructor(private readonly companyRolesService: CompanyRolesService) {}

  // ===========================================================================
  // 🔥 CRUD BÁSICO
  // ===========================================================================

  @Post()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cria um novo cargo para a empresa' })
  @ApiResponse({ status: 201, description: 'Cargo criado com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 409, description: 'Cargo já existe' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateCompanyRoleDto) {
    return this.companyRolesService.create(createDto);
  }

  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Lista todos os cargos da empresa' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    example: false,
  })
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('includeInactive') includeInactive: string = 'false',
  ) {
    return this.companyRolesService.findAll(
      page,
      limit,
      includeInactive === 'true',
    );
  }

  @Get('active')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Lista todos os cargos ativos da empresa (sem paginação)',
  })
  @ApiResponse({ status: 200, description: 'Lista de cargos ativos' })
  async findAllActive() {
    return this.companyRolesService.findAllActive();
  }

  @Get(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Busca um cargo específico pelo ID' })
  @ApiResponse({ status: 200, description: 'Cargo encontrado' })
  @ApiResponse({ status: 404, description: 'Cargo não encontrado' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companyRolesService.findOne(id);
  }

  @Get('by-name/:name')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Busca um cargo pelo nome' })
  @ApiResponse({ status: 200, description: 'Cargo encontrado' })
  @ApiResponse({ status: 404, description: 'Cargo não encontrado' })
  async findByName(@Param('name') name: string) {
    return this.companyRolesService.findByName(name);
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza um cargo existente' })
  @ApiResponse({ status: 200, description: 'Cargo atualizado com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Cargo não encontrado' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateCompanyRoleDto,
  ) {
    return this.companyRolesService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove (soft delete) um cargo' })
  @ApiResponse({ status: 204, description: 'Cargo removido com sucesso' })
  @ApiResponse({ status: 400, description: 'Cargo possui usuários vinculados' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.companyRolesService.remove(id);
  }

  @Patch(':id/restore')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Restaura um cargo inativado' })
  @ApiResponse({ status: 200, description: 'Cargo restaurado com sucesso' })
  async restore(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companyRolesService.restore(id);
  }

  // ===========================================================================
  // 🔥 GERENCIAMENTO DE COMPANY ROLE (Cargo na empresa)
  // ===========================================================================

  @Post('assign-company-role')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atribui um cargo de empresa a um usuário' })
  @ApiResponse({ status: 200, description: 'Cargo atribuído com sucesso' })
  async assignCompanyRoleToUser(@Body() assignDto: AssignRoleToUserDto) {
    return this.companyRolesService.assignCompanyRoleToUser(
      assignDto.userId,
      assignDto.roleId,
    );
  }

  @Delete('company-role/:roleId/users/:userId')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove o cargo de empresa de um usuário' })
  @ApiResponse({ status: 200, description: 'Cargo removido do usuário' })
  async removeCompanyRoleFromUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.companyRolesService.removeCompanyRoleFromUser(userId);
  }

  @Get(':id/company-role-users')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Lista usuários que têm este cargo como cargo de empresa',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getCompanyRoleUsers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.companyRolesService.getCompanyRoleUsers(id, page, limit);
  }

  // ===========================================================================
  // 🔥 GERENCIAMENTO DE PROFESSIONAL ROLE (Cargo profissional)
  // ===========================================================================

  @Post('assign-professional-role')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atribui um cargo profissional a um usuário' })
  @ApiResponse({
    status: 200,
    description: 'Cargo profissional atribuído com sucesso',
  })
  async assignProfessionalRoleToUser(@Body() assignDto: AssignRoleToUserDto) {
    return this.companyRolesService.assignProfessionalRoleToUser(
      assignDto.userId,
      assignDto.roleId,
    );
  }

  @Delete('professional-role/:roleId/users/:userId')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove o cargo profissional de um usuário' })
  @ApiResponse({
    status: 200,
    description: 'Cargo profissional removido do usuário',
  })
  async removeProfessionalRoleFromUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.companyRolesService.removeProfessionalRoleFromUser(userId);
  }

  @Get(':id/professional-role-users')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Lista usuários que têm este cargo como cargo profissional',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getProfessionalRoleUsers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.companyRolesService.getProfessionalRoleUsers(id, page, limit);
  }
}
