/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { SimpleStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- WRITE OPERATIONS ---
  @Post()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  async create(@Body() createUserDto: CreateUserDto, @Req() req: any) {
    // 🔥 Adiciona o ID do usuário que está criando
    const payload = {
      ...createUserDto,
      userCreateId: req.user.id,
    };
    
    const result = await this.usersService.createUser(payload);
    
    return {
      success: true,
      message: 'Usuário criado com sucesso!',
      data: result,
    };
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser({
      id,
      ...updateUserDto,
    });
  }

  @Patch(':id/status/:status')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('status') status: SimpleStatus,
  ) {
    if (!Object.values(SimpleStatus).includes(status)) {
      throw new BadRequestException('Status inválido');
    }
    return this.usersService.updateUser({
      id,
      status,
    });
  }

  @Delete(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.removeUser(id);
  }

  // --- READ OPERATIONS ---
  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('companyId') companyId?: string,
    @Query('status') status?: SimpleStatus,
    @Query('role') role?: UserRole,
    @Query('professionalRole') professionalRole?: string,
  ) {
    return this.usersService.findAll(page, limit, {
      status,
      role,
      companyId,
      professionalRole,
    });
  }

  @Get('company/:companyId')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  async findByCompany(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.usersService.findUsersByCompany(companyId);
  }

  @Get('by-role')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  async findByProfessionalRole(@Query('role') role: string) {
    if (!role) {
      throw new BadRequestException('O parâmetro "role" é obrigatório');
    }
    return this.usersService.findByProfessionalRole(role);
  }

  @Get('search')
  searchUsers(@Query('query') query: string) {
    return this.usersService.searchUsers(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findUserById(id);
  }
}