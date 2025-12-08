import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Este decorator extrai o objeto 'user' anexado ao Request pelo seu Guard de Autenticação (ex: Passport/JWT)
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Em produção, o Guard (AuthGuard) popula request.user
    return request.user;
  },
);