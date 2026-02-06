/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';

// As "Permissões" abstratas que o sistema entende.
// Se o nome do cargo mudar amanhã, este arquivo NÃO muda.
export enum AppPermission {
  MANAGE_FLOW = 'CAN_MANAGE_FLOW',   // Criar/Editar/Deletar Fluxo
  MANAGE_STAGE = 'CAN_MANAGE_STAGE', // Criar/Editar/Deletar Etapa
  // MANAGE_ITEMS não é estritamente necessário se for liberado para todos, 
  // mas é bom ter para consistência futura.
  MANAGE_ITEMS = 'CAN_MANAGE_ITEMS', 
  MANAGE_KANBAN_COLUMNS = 'CAN_MANAGE_KANBAN_COLUMNS',
   MANAGE_FLOW_ITEMS = 'CAN_MANAGE_FLOW_ITEMS', 
}

export const PERMISSIONS_KEY = 'permissions';

// O Decorator que usaremos no Controller
export const RequirePermissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);