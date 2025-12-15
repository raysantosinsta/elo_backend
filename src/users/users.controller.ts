/* eslint-disable prettier/prettier */
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
    Req,
    ForbiddenException, 
} from '@nestjs/common';
import { UserRole, SimpleStatus } from '@prisma/client'; 
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Request } from 'express';
import  { UsersService } from './users.service';

// Interface para o usuário anexado ao request pelo JwtAuthGuard
interface CustomRequest extends Request {
    user: {
        id: string; 
        companyId: string;
        role: UserRole;
    };
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    // --- WRITE OPERATIONS (Restricted) ---

    /**
     * Cria um novo usuário.
     * Requer permissão MASTER ou ADMIN.
     */
    @Post()
    @Roles(UserRole.MASTER, UserRole.ADMIN)
    create(
        @Req() req: CustomRequest, // Colocado antes do @Body
        @Body() createUserDto: CreateUserDto,
    ) {
        // Garantimos que a empresa é passada, usando a da requisição como fallback
        const effectiveCompanyId = createUserDto.companyId || req.user.companyId;

        return this.usersService.createUser({
            ...createUserDto,
            companyId: effectiveCompanyId,
        });
    }

    /**
     * Atualiza os dados de um usuário (incluindo status e perfil).
     * Requer permissão MASTER ou ADMIN.
     */
    @Patch(':id')
    @Roles(UserRole.MASTER, UserRole.ADMIN)
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: CustomRequest, // Colocado antes do @Body
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.usersService.updateUser({
            id,
            userUpdateId: req.user.id, // ID de auditoria
            ...updateUserDto,
        });
    }

    /**
     * Alterna o status do usuário (ACTIVE/INACTIVE).
     */
    @Patch(':id/status/:status') 
    @Roles(UserRole.MASTER, UserRole.ADMIN)
    toggleStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('status') status: SimpleStatus,
        @Req() req: CustomRequest,
    ) {
        // Você pode manter a validação aqui ou movê-la para um pipe/service.
        if (!Object.values(SimpleStatus).includes(status)) {
             throw new Error('Status inválido'); 
        }

        return this.usersService.updateUser({
            id,
            userUpdateId: req.user.id,
            status: status,
        });
    }

    /**
     * Remove fisicamente um usuário (MUITO RESTRITO).
     */
    @Delete(':id')
    @Roles(UserRole.MASTER)
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.removeUser(id); 
    }

    // --- READ OPERATIONS (Scoped) ---

    /**
     * Lista usuários, com paginação e filtros.
     */
    @Get()
    @Roles(UserRole.MASTER, UserRole.ADMIN)
    findAll(
        @Req() req: CustomRequest, // Colocado no início
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('companyId') companyId?: string,
        @Query('status') status?: SimpleStatus, 
        @Query('role') role?: UserRole,
    ) {
        // Lógica de escopo da empresa
        const effectiveCompanyId = req.user.role === UserRole.ADMIN && !companyId
            ? req.user.companyId
            : companyId;

        return this.usersService.findAll(page, limit, effectiveCompanyId, status, role);
    }

    /**
     * Lista todos os usuários de uma empresa específica.
     * Rota: GET /users/company/:companyId
     */
    @Get('company/:companyId')
    // Defina quem pode acessar. Se usuários comuns puderem ver (ex: para select), adicione UserRole.USER ou remova o @Roles
    @Roles(UserRole.MASTER, UserRole.ADMIN, UserRole.EMPLOYER) 
    async findByCompany(
        @Param('companyId', ParseUUIDPipe) companyId: string,
        @Req() req: CustomRequest,
    ) {
        // SEGURANÇA: Se não for MASTER, só pode listar da própria empresa
        if (req.user.role !== UserRole.MASTER && req.user.companyId !== companyId) {
            throw new ForbiddenException('Você não tem permissão para listar usuários desta empresa.');
        }

        return this.usersService.findUsersByCompany(companyId);
    }

    /**
     * Busca usuários pelo nome ou email (uso em menções/lookups).
     */
    @Get('search')
    searchUsers(
        @Req() req: CustomRequest,
        @Query('query') query: string,
        @Query('companyId') companyId?: string,
    ) {
        // Se companyId não for especificado, assume-se a empresa do usuário logado
        const effectiveCompanyId = companyId || req.user.companyId;

        return this.usersService.searchUsers(query, effectiveCompanyId);
    }

    /**
     * Busca um usuário pelo ID.
     */
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findUserById(id);
    }
}