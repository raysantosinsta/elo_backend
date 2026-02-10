/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';

/**
 * AppPermission: Representa CAPACIDADES administrativas.
 * * NOTA: Operações comuns (como mover cards ou ver o board) não precisam estar aqui
 * pois o PermissionsGuard já as concede automaticamente a qualquer usuário logado.
 */
export enum AppPermission {
  // Gestão de Estrutura (Reservado para Admins e Gestores de Produção)
  MANAGE_FLOW = 'CAN_MANAGE_FLOW',           // Criar, Editar e Deletar a Esteira (Fluxo)
  MANAGE_STAGE = 'CAN_MANAGE_STAGE',         // Configurar colunas e regras de cargo técnico
  MANAGE_KANBAN_COLUMNS = 'CAN_MANAGE_KANBAN_COLUMNS', // Alterar ordem e visual das colunas
  
  // Gestão de Dados (Opcional: para controle fino de templates)
  MANAGE_TEMPLATES = 'CAN_MANAGE_TEMPLATES', 
}

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator para proteger rotas no Controller.
 * Exemplo: @RequirePermissions(AppPermission.MANAGE_FLOW)
 */
export const RequirePermissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);