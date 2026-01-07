/* eslint-disable prettier/prettier */
export class CreateRouteDto {
  driverLat: number;
  driverLng: number;
  taskIds: string[]; // IDs das tarefas selecionadas no checkbox
  userId: string; // ID do motorista
}
