/* eslint-disable prettier/prettier */
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
  UseInterceptors, // 🔥 REQUIRED
} from '@nestjs/common';
import { SimpleStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor'; // 🔥 Import this
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor) // 🔥 THIS FIXES THE 500 ERROR
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- WRITE OPERATIONS ---

  @Post()
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    // The Service will handle the logic using the Context
    return this.usersService.createUser(createUserDto);
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
      throw new Error('Status inválido');
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
  @Roles(UserRole.MASTER, UserRole.ADMIN)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('companyId') companyId?: string,
    @Query('status') status?: SimpleStatus,
    @Query('role') role?: UserRole,
  ) {
    // The service uses CLS context to filter data automatically
    return this.usersService.findAll(page, limit, { status, role, companyId });
  }

  @Get('company/:companyId')
  @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER)
  async findByCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.usersService.findUsersByCompany(companyId);
  }

  @Get('search')
  searchUsers(
    @Query('query') query: string,
  ) {
    return this.usersService.searchUsers(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findUserById(id);
  }
}