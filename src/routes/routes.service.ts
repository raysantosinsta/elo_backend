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
  ) { }

  /**
   * Busca tarefas que possuem localização válida (Latitude e Longitude não nulas).
   * Aplica filtros de data e usuário responsável se fornecidos.
   * * @param companyId - ID da empresa logada.
   * @param filters - Objeto contendo data inicio/fim e ID do responsável.
   * @returns Lista de tarefas encontradas.
   */
  async getTasksWithLocation(
    companyId: string,
    filters: { startDate?: string; endDate?: string; assignedToId?: string }
  ) {
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

    this.logger.log(`[getTasksWithLocation] Found ${tasks.length} tasks with location.`);
    // Log detalhado (cuidado em produção com muitos dados)
    if (tasks.length > 0) {
        this.logger.debug(`[getTasksWithLocation] Sample Task Address: ${JSON.stringify(tasks[0].taskAddress)}`);
    }

    return tasks;

  }

  /**
   * OTIMIZADOR DE ROTAS (O Coração da Logística).
   * Recebe uma lista de IDs de tarefas e a localização do motorista.
   * Retorna as tarefas ordenadas pela melhor sequência lógica.
   * * @param dto - Dados contendo IDs das tarefas e localização inicial do motorista.
   */
  async optimizeRoute(dto: OptimizeRouteDto) {
    // 1. Busca todas as tarefas solicitadas no banco de dados
    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: dto.taskIds }, // Filtra pelos IDs recebidos
        taskAddress: { // Garante novamente que têm coordenadas (segurança)
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        taskAddress: true,
        column: { select: { id: true } }, // Traz o ID da coluna Kanban - manter esse campo em caso de conclusao eu mudar a tarefa para outra coluna
        userAssigned: { select: { id: true, name: true } }
      },
    });

    this.logger.log(`[optimizeRoute] Retrieved ${tasks.length} tasks from DB for optimization.`);

    if (tasks.length === 0) {
      this.logger.warn(`[optimizeRoute] No valid tasks found for IDs: ${dto.taskIds.join(', ')}`);
      throw new NotFoundException('Nenhuma tarefa válida encontrada.');
    }

    // Log para verificar coordenadas
    tasks.forEach(t => {
        this.logger.debug(`[optimizeRoute] Task ${t.id} coords: [${t.taskAddress?.latitude}, ${t.taskAddress?.longitude}]`);
    });

    let optimizedOrder: typeof tasks = [];

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    // Simplesmente ordena do número menor (Alta prioridade) para o maior.
    if (dto.orderBy === RouteOrderType.PRIORITY) {
      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999; // Se for nulo, joga pro final (999)
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });
    }
    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Algoritmo Vizinho Mais Próximo) ---
    // Lógica: "Estou aqui, qual a tarefa mais perto? Vou pra lá. Agora estou lá, qual a próxima mais perto?"
    else {
      // Ponto de partida (Localização do Motorista)
      let currentLocation = {
        lat: Number(dto.driverLatitude),
        lng: Number(dto.driverLongitude),
      };

      // Cria uma cópia da lista para ir removendo as tarefas já visitadas
      const remainingTasks = [...tasks];



      // Enquanto houver tarefas na lista de pendentes...
      while (remainingTasks.length > 0) {
        let nearestTaskIndex = -1; // Essa variável guarda o índice do item vencedor na lista, e começa em `-1` porque listas iniciam no índice `0`, então `-1` indica que ninguém foi escolhido ainda.

        let minDistance = Infinity; // Você precisa de um valor inicial para comparação, pois se começasse com `minDistance = 0` nenhuma distância ganharia (nada é menor que zero), então usar `Infinity` garante que qualquer distância real seja menor e que o primeiro item da lista se torne o campeão inicial.


        // Percorre todas as tarefas restantes para achar a mais próxima da currentLocation(motorista)
        for (let i = 0; i < remainingTasks.length; i++) {
          const t = remainingTasks[i];

          // Converte para Number para evitar erros matemáticos com strings
          const tLat = Number(t.taskAddress?.latitude);
          const tLng = Number(t.taskAddress?.longitude);

          // Segurança: Se coordenadas forem inválidas, pula
          if (!t.taskAddress || isNaN(tLat) || isNaN(tLng)) {
            continue; // volte para o for e verifique outra tarefa
          }

          // Calcula distância entre ONDE ESTOU e a TAREFA 't'
          const dist = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            tLat,
            tLng,
          );

          // Se essa distância for menor que a menor encontrada até agora, atualiza
          if (dist < minDistance) {
            minDistance = dist;
            nearestTaskIndex = i;
          }
        }

        // Se não achou ninguém (ex: sobrou item sem coordenada), sai do loop
        if (nearestTaskIndex === -1) {
          optimizedOrder.push(...remainingTasks); // Adiciona o resto ao final
          break;
        }

        // Adiciona a tarefa mais próxima na lista otimizada
        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);

        // Atualiza a "localização atual" do motorista para a tarefa que ele acabou de "visitar"
        const nextLat = Number(nearestTask.taskAddress?.latitude);
        const nextLng = Number(nearestTask.taskAddress?.longitude);

        if (!isNaN(nextLat) && !isNaN(nextLng)) {
          currentLocation = { lat: nextLat, lng: nextLng };
        }

        // Remove a tarefa escolhida da lista de pendentes para não visitar de novo
        remainingTasks.splice(nearestTaskIndex, 1);
      }
    }

    // --- CÁLCULO DE ESTATÍSTICAS DA ROTA (Tempo/Distância) ---
    const stats = await this.calculateRouteStats(
      { lat: Number(dto.driverLatitude), lng: Number(dto.driverLongitude) },
      optimizedOrder,
    );

    this.logger.log(`[optimizeRoute] Returning optimized route with ${optimizedOrder.length} stops.`);

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

      // Monta string de coordenadas no formato que a API OSRM aceita: long,lat;long,lat
      const coordinates = [
        `${startPos.lng},${startPos.lat}`, // Ponto inicial
        ...validTasks.map(
          (t: any) => `${Number(t.taskAddress.longitude)},${Number(t.taskAddress.latitude)}`,
        ),
      ].join(';');

      // Chama a API pública do OSRM (Cuidado: não usar em produção pesada, tem limites)
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        // Se a API retornou sucesso
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
      this.logger.warn('Erro ao consultar OSRM, usando cálculo linear fallback.', error);
    }

    // --- FALLBACK (PLANO B) ---
    // Se a API falhar, calcula somando distâncias em linha reta
    let totalDistKm = 0;
    let current = startPos;

    for (const task of tasks) {
      const tAddr = (task as any).taskAddress;
      const lat = Number(tAddr?.latitude);
      const lng = Number(tAddr?.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        totalDistKm += this.calculateDistance(
          current.lat,
          current.lng,
          lat,
          lng,
        );
        current = { lat, lng }; // Avança o ponteiro
      }
    }

    // Estima o tempo assumindo uma velocidade média de 30km/h
    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

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
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *

      // [PARTE 3]: Distância "Horizontal" (Leste–Oeste)
      // Calcula o seno ao quadrado da metade da diferença de longitude.
      // Representa o deslocamento horizontal corrigido pela curvatura da Terra.
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

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