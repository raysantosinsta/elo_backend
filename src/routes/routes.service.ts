/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { TaskStatus, type Prisma, type Task } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { PrismaService } from '../prisma/prisma.service';
import {
  FinalizeTaskDto,
  OptimizeRouteDto,
  RouteOrderType,
} from './dto/optimize-route.dto';

/**
 * Service responsável pela lógica de rotas e otimização logística.
 * Ele lida com busca de tarefas geolocalizadas, algoritmos de ordenação (Vizinho Mais Próximo)
 * e cálculos de distância/tempo.
 */
@Injectable()
export class RouteService {
  // Logger permite ver mensagens coloridas no terminal do servidor (útil para debug)
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private prisma: PrismaService, // Conexão com o banco de dados
    @Inject(CACHE_MANAGER) private cacheManager: Cache, // Gerenciador de Cache (Redis/Memória)
  ) {}

  /**
   * Busca tarefas que possuem localização válida (Latitude e Longitude não nulas).
   * Aplica filtros de data e usuário responsável se fornecidos.
   * * @param companyId - ID da empresa logada.
   * @param filters - Objeto contendo data inicio/fim e ID do responsável.
   * @returns Lista de tarefas encontradas.
   */
  async getTasksWithLocation(
    companyId: string,
    filters: { startDate?: string; endDate?: string; assignedToId?: string },
  ) {
    // Log para ver todas as tarefas da empresa
    const allTasks = await this.prisma.task.findMany({
      where: { companyId },
      include: { taskAddress: true },
    });

    this.logger.log(
      `📊 [getTasksWithLocation] Total de tarefas na empresa: ${allTasks.length}`,
    );

    allTasks.forEach((task) => {
      this.logger.log(
        `   - ${task.id}: ${task.title} | hasAddress: ${!!task.taskAddress} | lat: ${task.taskAddress?.latitude} | lng: ${task.taskAddress?.longitude}`,
      );
    });

    // 1. Monta o objeto de filtro inicial (WHERE)
    const where: Prisma.TaskWhereInput = {
      companyId,
      // Apenas tarefas Pendentes ou Em Progresso entram na rota
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      // Garante que a tarefa tem endereço com coordenadas salvas
      taskAddress: {
        latitude: { not: null },
        longitude: { not: null },
      },
    };

    // 2. Se houver filtro de data, adiciona ao WHERE
    if (filters.startDate || filters.endDate) {
      where.scheduledDate = {
        // gte = greater than or equal (maior ou igual)
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        // lte = less than or equal (menor ou igual)
        ...(filters.endDate && { lte: new Date(filters.endDate) }),
      };
    }

    // 3. Se houver filtro de motorista/usuário, adiciona ao WHERE
    if (filters.assignedToId && filters.assignedToId !== 'all') {
      where.userAssignedId = filters.assignedToId;
    }

    // 4. Executa a busca no banco
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        taskAddress: true,
        userAssigned: { select: { name: true } },
        column: { select: { id: true } },
      },
    });

    this.logger.log(
      `[getTasksWithLocation] Found ${tasks.length} tasks with location.`,
    );
    // Log detalhado (cuidado em produção com muitos dados)
    if (tasks.length > 0) {
      this.logger.debug(
        `[getTasksWithLocation] Sample Task Address: ${JSON.stringify(tasks[0].taskAddress)}`,
      );
    }

    return tasks;
  }

  // src/tasks/routes.service.ts

  /**
   * OTIMIZADOR DE ROTAS (O Coração da Logística).
   * Recebe uma lista de IDs de tarefas e a localização do motorista.
   * Retorna as tarefas ordenadas pela melhor sequência lógica.
   * @param dto - Dados contendo IDs das tarefas e localização inicial do motorista.
   */
  async optimizeRoute(dto: OptimizeRouteDto) {
    this.logger.log('='.repeat(80));
    this.logger.log('🚀 [optimizeRoute] INICIANDO OTIMIZAÇÃO DE ROTA');
    this.logger.log('='.repeat(80));
    this.logger.log(`📦 Quantidade de tarefas: ${dto.taskIds.length}`);
    this.logger.log(
      `📍 Localização motorista: lat=${dto.driverLatitude}, lng=${dto.driverLongitude}`,
    );
    this.logger.log(
      `🎯 Tipo de ordenação: ${dto.orderBy || 'DISTANCE (padrão)'}`,
    );
    this.logger.log(`📋 IDs das tarefas: ${dto.taskIds.join(', ')}`);

    // 1. Busca todas as tarefas solicitadas no banco de dados
    this.logger.log('🔍 [1/6] Buscando tarefas no banco de dados...');

    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: dto.taskIds },
        taskAddress: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        taskAddress: true,
        column: { select: { id: true } },
        userAssigned: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `✅ [1/6] Tarefas encontradas: ${tasks.length} de ${dto.taskIds.length} solicitadas`,
    );

    // Log detalhado das tarefas encontradas
    tasks.forEach((task, index) => {
      this.logger.log(
        `   ${index + 1}. ID: ${task.id} | Título: ${task.title}`,
      );
      this.logger.log(
        `      Endereço: ${task.taskAddress?.endereco}, ${task.taskAddress?.numero} - ${task.taskAddress?.cidade}`,
      );
      this.logger.log(
        `      Coordenadas: lat=${task.taskAddress?.latitude}, lng=${task.taskAddress?.longitude}`,
      );
    });

    // Verificar tarefas que não foram encontradas
    const foundIds = tasks.map((t) => t.id);
    const missingIds = dto.taskIds.filter((id) => !foundIds.includes(id));
    if (missingIds.length > 0) {
      this.logger.warn(
        `⚠️ Tarefas não encontradas (sem coordenadas válidas): ${missingIds.join(', ')}`,
      );
    }

    if (tasks.length === 0) {
      this.logger.error(`❌ [1/6] Nenhuma tarefa válida encontrada!`);
      this.logger.error(`   IDs solicitados: ${dto.taskIds.join(', ')}`);
      throw new NotFoundException(
        'Nenhuma tarefa válida encontrada. Verifique se todas as tarefas têm endereço com coordenadas.',
      );
    }

    let optimizedOrder: typeof tasks = [];

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    if (dto.orderBy === RouteOrderType.PRIORITY) {
      this.logger.log('🎯 [2/6] Usando ordenação por PRIORIDADE');

      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });

      this.logger.log('📊 Ordem por prioridade:');
      optimizedOrder.forEach((task, idx) => {
        this.logger.log(
          `   ${idx + 1}. ${task.title} (prioridade: ${task.priority ?? 'N/A'})`,
        );
      });
    }
    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Algoritmo Vizinho Mais Próximo) ---
    else {
      this.logger.log(
        '🎯 [2/6] Usando ordenação por PROXIMIDADE (Vizinho Mais Próximo)',
      );

      // Ponto de partida (Localização do Motorista)
      let currentLocation = {
        lat: Number(dto.driverLatitude),
        lng: Number(dto.driverLongitude),
      };
      this.logger.log(
        `📍 Ponto de partida: lat=${currentLocation.lat}, lng=${currentLocation.lng}`,
      );

      // Cria uma cópia da lista para ir removendo as tarefas já visitadas
      const remainingTasks = [...tasks];
      this.logger.log(`📋 Tarefas pendentes: ${remainingTasks.length}`);

      let iteration = 0;

      // Enquanto houver tarefas na lista de pendentes...
      while (remainingTasks.length > 0) {
        iteration++;
        this.logger.log(
          `\n🔄 [Iteração ${iteration}] Tarefas restantes: ${remainingTasks.length}`,
        );
        this.logger.log(
          `📍 Posição atual: lat=${currentLocation.lat}, lng=${currentLocation.lng}`,
        );

        let nearestTaskIndex = -1;
        let minDistance = Infinity;
        // let minDistanceTaskName = '';

        // Percorre todas as tarefas restantes para achar a mais próxima
        for (let i = 0; i < remainingTasks.length; i++) {
          const t = remainingTasks[i];
          const tLat = Number(t.taskAddress?.latitude);
          const tLng = Number(t.taskAddress?.longitude);

          if (!t.taskAddress || isNaN(tLat) || isNaN(tLng)) {
            this.logger.warn(
              `   ⚠️ Tarefa ${t.id} (${t.title}) - coordenadas inválidas, ignorando`,
            );
            continue;
          }

          const dist = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            tLat,
            tLng,
          );

          this.logger.log(
            `   📍 Tarefa: ${t.title} | Distância: ${dist.toFixed(2)} km`,
          );

          if (dist < minDistance) {
            minDistance = dist;
            nearestTaskIndex = i;
            // minDistanceTaskName = t.title;
          }
        }

        if (nearestTaskIndex === -1) {
          this.logger.warn(
            `⚠️ Nenhuma tarefa válida encontrada na iteração ${iteration}`,
          );
          optimizedOrder.push(...remainingTasks);
          break;
        }

        // Adiciona a tarefa mais próxima na lista otimizada
        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);
        this.logger.log(
          `✅ Tarefa escolhida: ${nearestTask.title} (distância: ${minDistance.toFixed(2)} km)`,
        );

        // Atualiza a localização atual
        const nextLat = Number(nearestTask.taskAddress?.latitude);
        const nextLng = Number(nearestTask.taskAddress?.longitude);

        if (!isNaN(nextLat) && !isNaN(nextLng)) {
          currentLocation = { lat: nextLat, lng: nextLng };
          this.logger.log(
            `📍 Nova posição: ${nearestTask.taskAddress?.endereco}, ${nearestTask.taskAddress?.numero}`,
          );
        }

        // Remove a tarefa escolhida da lista de pendentes
        remainingTasks.splice(nearestTaskIndex, 1);
      }

      this.logger.log(
        `\n✅ [2/6] Ordenação por proximidade concluída em ${iteration} iterações`,
      );
      this.logger.log('📊 Ordem final da rota:');
      optimizedOrder.forEach((task, idx) => {
        this.logger.log(
          `   ${idx + 1}. ${task.title} (${task.taskAddress?.cidade})`,
        );
      });
    }

    // --- CÁLCULO DE ESTATÍSTICAS DA ROTA ---
    this.logger.log('\n📊 [3/6] Calculando estatísticas da rota...');

    const stats = await this.calculateRouteStats(
      { lat: Number(dto.driverLatitude), lng: Number(dto.driverLongitude) },
      optimizedOrder,
    );

    this.logger.log(`✅ [3/6] Estatísticas calculadas:`);
    this.logger.log(`   Tempo total: ${stats.formattedDuration}`);
    this.logger.log(`   Distância total: ${stats.formattedDistance}`);
    this.logger.log(`   Segundos: ${stats.totalDurationSeconds}`);
    this.logger.log(`   Metros: ${stats.totalDistanceMeters}`);

    // --- VALIDAÇÃO FINAL ---
    this.logger.log('\n🔍 [4/6] Validando rota final...');

    if (optimizedOrder.length !== tasks.length) {
      this.logger.warn(
        `⚠️ Aviso: ${optimizedOrder.length} tarefas otimizadas, mas ${tasks.length} foram encontradas`,
      );
    }

    // Verificar se todas as tarefas originais estão na rota
    const optimizedIds = optimizedOrder.map((t) => t.id);
    const missingInOptimized = tasks.filter(
      (t) => !optimizedIds.includes(t.id),
    );
    if (missingInOptimized.length > 0) {
      this.logger.warn(
        `⚠️ Tarefas não incluídas na rota: ${missingInOptimized.map((t) => t.title).join(', ')}`,
      );
    }

    this.logger.log('\n' + '='.repeat(80));
    this.logger.log(
      `✅ [FINAL] Rota otimizada com ${optimizedOrder.length} paradas`,
    );
    this.logger.log(`   Tempo estimado: ${stats.formattedDuration}`);
    this.logger.log(`   Distância: ${stats.formattedDistance}`);
    this.logger.log('='.repeat(80) + '\n');

    return {
      route: optimizedOrder,
      stats: stats,
    };
  }

  /**
   * Calcula o tempo e distância totais da rota.
   * Tenta usar a API OSRM (Open Source Routing Machine) para dados reais de direção.
   * Se falhar, usa cálculo matemático linear (Haversine) como fallback.
   */
  private async calculateRouteStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ) {
    try {
      // Filtra tarefas válidas para a API
      const validTasks = tasks.filter((t: any) => {
        const lat = Number(t.taskAddress?.latitude);
        const lng = Number(t.taskAddress?.longitude);
        return !isNaN(lat) && !isNaN(lng);
      });

      if (validTasks.length === 0) {
        this.logger.warn(
          '[calculateRouteStats] Nenhuma tarefa com coordenadas válidas',
        );
        return this.getFallbackStats(startPos, tasks);
      }

      // Monta string de coordenadas
      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...validTasks.map(
          (t: any) =>
            `${Number(t.taskAddress.longitude)},${Number(t.taskAddress.latitude)}`,
        ),
      ].join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

      this.logger.log(`[calculateRouteStats] Chamando OSRM: ${url}`);

      // 🔥 ADICIONAR TIMEOUT DE 10 SEGUNDOS
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        this.logger.log(
          `[calculateRouteStats] Resposta OSRM: ${JSON.stringify(data).substring(0, 200)}`,
        );

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            totalDurationSeconds: route.duration,
            totalDistanceMeters: route.distance,
            formattedDuration: this.formatDuration(route.duration),
            formattedDistance: `${(route.distance / 1000).toFixed(1)} km`,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        'Erro ao consultar OSRM, usando cálculo linear fallback.',
        error,
      );
    }

    // --- FALLBACK (PLANO B) ---
    return this.getFallbackStats(startPos, tasks);
  }

  // 🔥 MÉTODO SEPARADO PARA O FALLBACK
  private getFallbackStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ) {
    this.logger.log('[calculateRouteStats] Usando fallback linear (Haversine)');

    let totalDistKm = 0;
    let current = startPos;

    for (const task of tasks) {
      const tAddr = (task as any).taskAddress;
      const lat = Number(tAddr?.latitude);
      const lng = Number(tAddr?.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        const dist = this.calculateDistance(current.lat, current.lng, lat, lng);
        this.logger.debug(
          `Distância de (${current.lat},${current.lng}) para (${lat},${lng}): ${dist.toFixed(2)} km`,
        );
        totalDistKm += dist;
        current = { lat, lng };
      }
    }

    // Estima o tempo assumindo uma velocidade média de 30km/h
    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    this.logger.log(
      `[calculateRouteStats] Fallback: ${totalDistKm.toFixed(2)} km, ${estimatedSeconds.toFixed(0)} segundos`,
    );

    return {
      totalDurationSeconds: estimatedSeconds,
      totalDistanceMeters: totalDistKm * 1000,
      formattedDuration: `~${this.formatDuration(estimatedSeconds)}`,
      formattedDistance: `~${totalDistKm.toFixed(1)} km`,
    };
  }

  // Auxiliar para formatar segundos em "2h 30min"
  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

  /**
   * Finaliza ou Reagenda uma tarefa na rota.
   * Se vier uma nova data (scheduledAt), muda status para PENDING (reagendado).
   * Se não, finaliza como COMPLETED ou FAILED.
   */
  async concludeVisit(taskId: string, userId: string, dto: FinalizeTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    // Determina o novo status baseado na lógica de negócio
    const statusFinal = dto.scheduledAt
      ? TaskStatus.PENDING // Se tem nova data, volta para pendente
      : dto.status === 'COMPLETED'
        ? TaskStatus.COMPLETED
        : TaskStatus.FAILED;

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: statusFinal,
        finalComment: dto.finalComment,
        // Atualiza datas se for reagendamento
        scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        dueDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        // Se concluiu, marca a data de hoje. Se reagendou, limpa a conclusão.
        completionDate: dto.scheduledAt ? null : new Date(),
        userCompletedId: userId,
      },
      include: this.getTaskIncludeDetails(),
    });

    return {
      message: dto.scheduledAt
        ? 'Tarefa reagendada com sucesso'
        : 'Tarefa finalizada com sucesso',
      task: updatedTask,
    };
  }

  // Auxiliar para padronizar os INCLUDES do Prisma (evita repetição de código)
  private getTaskIncludeDetails() {
    return {
      taskAddress: true,
      userAssigned: { select: { name: true } },
      userCompleted: { select: { name: true } },
    };
  }

  /**
   * FÓRMULA DE HAVERSINE
   * Calcula a distância em KM entre dois pontos no globo terrestre (Latitude/Longitude).
   * É pura trigonometria esférica usada para calcular a "linha reta" na superfície curva da Terra.
   *
   * @param lat1 - Latitude do Ponto A (ex: -23.5505)
   * @param lon1 - Longitude do Ponto A (ex: -46.6333)
   * @param lat2 - Latitude do Ponto B (ex: -22.9068)
   * @param lon2 - Longitude do Ponto B (ex: -43.1729)
   * @returns A distância em Quilômetros (number).
   *
   * @example
   * // Calculando distância entre São Paulo e Rio de Janeiro:
   * const distancia = this.calculateDistance(-23.5505, -46.6333, -22.9068, -43.1729);
   * // Resultado: ~366.4 km
   * * @see https://www.linkedin.com/pulse/desvendando-f%25C3%25B3rmula-de-haversine-como-calcular-reais-na-santos-4fmae/?published=t
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Raio da Terra em KM
    const dLat = this.deg2rad(lat2 - lat1); // Diferença de latitudes em radianos
    const dLon = this.deg2rad(lon2 - lon1); // Diferença de longitudes em radianos

    // Cálculo do valor 'a' (Fórmula de Haversine)
    //
    // Importante: o valor "a" NÃO é a distância.
    // Ele é apenas um valor intermediário da trigonometria esférica,
    // usado para chegar ao ângulo real entre os dois pontos.
    const a =
      // [PARTE 1]: Distância "Vertical" (Norte–Sul)
      // Calcula o seno ao quadrado da metade da diferença de latitude.
      // Representa o deslocamento vertical sobre a superfície da Terra.
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      // [PARTE 2]: Ajuste de Curvatura da Terra
      // A Terra não é um plano: ela "afunila" nos polos.
      // Por isso, a distância entre longitudes diminui conforme a latitude aumenta.
      // Multiplicamos pelos cossenos das latitudes para compensar esse efeito.
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        // [PARTE 3]: Distância "Horizontal" (Leste–Oeste)
        // Calcula o seno ao quadrado da metade da diferença de longitude.
        // Representa o deslocamento horizontal corrigido pela curvatura da Terra.
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    // Cálculo do ângulo central entre os dois pontos na esfera (em radianos)
    //
    // Aqui transformamos o valor intermediário "a" no ângulo real "c",
    // que representa o menor arco possível sobre a superfície da Terra.
    //
    // Fórmula matemática equivalente:
    // c = 2 · atan2( √a , √(1 − a) )
    //
    // Por que isso funciona?
    // - O valor "a" representa uma relação trigonométrica ligada
    //   à corda interna (linha reta dentro da esfera) que conecta os dois pontos.
    // - A função atan2(y, x) é usada em vez de atan(y / x) porque:
    //     • é numericamente mais estável
    //     • evita erros quando os pontos estão muito próximos
    //     • lida corretamente com valores extremos (a ≈ 0 ou a ≈ 1)
    //
    // O resultado "c":
    // - é a distância angular entre os pontos
    // - está em radianos
    // - representa o ângulo no centro da Terra entre as duas coordenadas
    //
    // Esse ângulo, quando multiplicado pelo raio da Terra (R),
    // resulta na distância real sobre a superfície:
    // a
    // distância = R · c
    //
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Resumo conceitual:
    // a  -> valor trigonométrico intermediário
    // c  -> ângulo central (em radianos)
    // R·c -> distância real sobre a superfície da Terra
    //
    // Distância final em quilômetros:
    // RESUMO: o angulo "c" vezes o "raio" resulta na distancia entre dois pontos da terrA
    return R * c;
  }

  // Converte Graus para Radianos (necessário para funções Math.sin/cos)
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
