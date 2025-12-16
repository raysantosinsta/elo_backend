/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para extrair o usuário logado (ou uma propriedade dele) do Request.
 * @example @CurrentUser() user: User
 * @example @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Se passou um parâmetro (ex: 'email'), retorna só ele. Se não, retorna o objeto todo.
    return data ? user?.[data] : user;
  },
);