/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Chave utilizada para armazenar e recuperar os metadados de funções (roles) 
 * através do Reflector do NestJS.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator customizado para definir quais níveis de acesso (roles) são permitidos 
 * em uma rota específica ou em todo um Controller.
 * * @param roles - Lista de funções permitidas (ex: UserRole.ADMIN, UserRole.MASTER, UserRole.EMPLOYER).
 * * @example
 * // Uso em um Controller:
 * @Roles(UserRole.ADMIN)
 * @Post('create-config')
 * create() { ... }
 * * @usageNotes
 * Este decorator apenas "marca" a rota com metadados. Para efetivar o bloqueio de acesso, 
 * você deve utilizar um `RolesGuard` que utilize o `Reflector` para ler a `ROLES_KEY`.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);