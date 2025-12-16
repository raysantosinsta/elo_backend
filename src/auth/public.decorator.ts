/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';

/**
 * Chave de metadados utilizada para identificar rotas públicas.
 * Consultada pelo `JwtAuthGuard` (ou Reflector) para pular a verificação de token.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator que marca um endpoint ou controller como público.
 * * @description
 * Quando aplicado, instrui o Guard de autenticação a ignorar a verificação de JWT 
 * para esta rota específica. Essencial para rotas de Login, Cadastro ou Health Check.
 * * @example
 * // No Controller
 * @Public()
 * @Post('login')
 * login(@Body() loginDto: LoginDto) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);