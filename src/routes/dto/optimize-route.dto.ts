import { IsString, IsArray, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class OptimizeRouteDto {
  @IsArray()
  @IsString({ each: true })
  taskIds: string[]; // IDs das tarefas selecionadas no Front

  @IsNumber()
  driverLatitude: number; // Onde o motorista está AGORA

  @IsNumber()
  driverLongitude: number;
}

export class FinalizeTaskDto {
  @IsString()
  status: 'COMPLETED' | 'FAILED'; // Usando strings para facilitar mapeamento

  @IsString()
  @IsOptional()
  finalComment?: string;

   @IsOptional()
  @IsDateString()
  scheduledAt?: string; // Adicione este campo
}
