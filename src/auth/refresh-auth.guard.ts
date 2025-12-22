/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard responsável por validar o JWT Refresh Token.
 * Utiliza a estratégia 'jwt-refresh' definida na configuração do Passport.
 * Aplica-se a rotas que requerem autenticação via Refresh Token.
 * Extende a classe AuthGuard do Passport para aproveitar a funcionalidade de autenticação.
 */
@Injectable()
export class RefreshAuthGuard extends AuthGuard('jwt-refresh') {}