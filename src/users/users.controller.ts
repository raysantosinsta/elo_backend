/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
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
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'; // Ajuste o caminho
import { Public } from 'src/auth/public.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard) // Proteção Global do Controller
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- WRITE OPERATIONS (Restricted) ---

  @Post()
  @Roles(UserRole.MASTER, UserRole.ADMIN) // Apenas Admins criam users
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.MASTER) // Apenas MASTER deleta
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Patch(':id/status') // Unificado activate/deactivate
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: UserStatus,
  ) {
    return this.usersService.toggleStatus(id, status);
  }

  // --- READ OPERATIONS (Scoped) ---

  @Get()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('companyId') companyId?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
  ) {
    return this.usersService.findAll(page, limit, companyId, status, role);
  }

  @Get('search')
  searchUsers(
    @Query('query') query: string,
    @Query('companyId') companyId?: string,
  ) {
    // Permitido para todos usuários logados (para menções em chat, etc)
    return this.usersService.searchUsers(query, companyId);
  }

  @Get('mentions')
  searchMentions(
    @Query('query') query: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.usersService.searchUsers(query, companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('includeWithoutCompany', new DefaultValuePipe(false)) includeWithoutCompany: boolean,
  ) {
    return this.usersService.findByCompany(companyId, includeWithoutCompany);
  }
}