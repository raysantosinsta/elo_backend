/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getToken as getMetricToken } from '@willsoto/nestjs-prometheus';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CreateFlowItemDto } from './dto/create-flow.dto';
import { FlowService } from './flow.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../audit/audit.service';
import { SupabaseService } from '../supabase/supabase.service';

// Mock do contador e histograma do Prometheus
const mockCounter = {
  inc: jest.fn(),
};

const mockHistogram = {
  labels: jest.fn().mockReturnThis(),
  startTimer: jest.fn().mockReturnValue(jest.fn()),
};

describe('FlowService', () => {
  let service: FlowService;
  let prismaService: PrismaService;
  let clsService: ClsService;
  let cacheManager: any;
  let auditService: AuditService;

  // Mock do Prisma
  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
    },
    flowItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productFlow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    flowStage: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    flowTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  // Mock do CLS Service
  const mockClsService = {
    get: jest.fn(),
  };

  // Mock do Cache Manager
  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  // Mock do Supabase Service
  const mockSupabaseService = {
    uploadFlowFile: jest.fn(),
    deleteFlowFile: jest.fn(),
  };

  // Mock do Audit Service
  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: getMetricToken('flow_item_moves_total'),
          useValue: mockCounter,
        },
        {
          provide: getMetricToken('db_operation_duration_seconds'),
          useValue: mockHistogram,
        },
      ],
    }).compile();

    service = module.get<FlowService>(FlowService);
    prismaService = module.get<PrismaService>(PrismaService);
    clsService = module.get<ClsService>(ClsService);
    cacheManager = module.get(CACHE_MANAGER);
    auditService = module.get<AuditService>(AuditService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCompanyIdFromContext', () => {
    it('should return companyId when present in CLS', () => {
      const mockCompanyId = 'company-123';
      mockClsService.get.mockReturnValue(mockCompanyId);

      // Acessa o método privado via any
      const result = (service as any).getCompanyIdFromContext();

      expect(result).toBe(mockCompanyId);
      expect(mockClsService.get).toHaveBeenCalledWith('tenantId');
    });

    it('should throw ForbiddenException when companyId not found', () => {
      mockClsService.get.mockReturnValue(undefined);

      expect(() => (service as any).getCompanyIdFromContext()).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('isCorteStage', () => {
    it('should return true for stage names containing corte keywords', () => {
      const testCases = [
        'Corte',
        'CORTADOR',
        'cortar',
        'Corte Tecido',
        'Pré-Corte',
      ];

      testCases.forEach((stageName) => {
        expect((service as any).isCorteStage(stageName)).toBe(true);
      });
    });

    it('should return false for stage names without corte keywords', () => {
      const testCases = ['Costura', 'Acabamento', 'Expedição', 'Modelagem'];

      testCases.forEach((stageName) => {
        expect((service as any).isCorteStage(stageName)).toBe(false);
      });
    });

    it('should handle empty or undefined stage names', () => {
      expect((service as any).isCorteStage('')).toBe(false);
      expect((service as any).isCorteStage(null)).toBe(false);
      expect((service as any).isCorteStage(undefined)).toBe(false);
    });
  });

  describe('isUserAdmin', () => {
    it('should return true for admin roles', async () => {
      const mockUser = { role: 'ADMIN' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await (service as any).isUserAdmin(
        'user-123',
        'company-123',
      );

      expect(result).toBe(true);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
          companyId: 'company-123',
          status: 'ACTIVE',
        },
        select: { role: true },
      });
    });

    it('should return true for MASTER role', async () => {
      const mockUser = { role: 'MASTER' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await (service as any).isUserAdmin(
        'user-123',
        'company-123',
      );

      expect(result).toBe(true);
    });

    it('should return true for MANAGER role', async () => {
      const mockUser = { role: 'MANAGER' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await (service as any).isUserAdmin(
        'user-123',
        'company-123',
      );

      expect(result).toBe(true);
    });

    it('should return false for non-admin roles', async () => {
      const mockUser = { role: 'USER' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await (service as any).isUserAdmin(
        'user-123',
        'company-123',
      );

      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await (service as any).isUserAdmin(
        'user-123',
        'company-123',
      );

      expect(result).toBe(false);
    });
  });

  describe('createFlowItem', () => {
    const mockCompanyId = 'company-123';
    const mockFlowId = 'flow-123';
    const mockUserId = 'user-123';
    const mockStageId = 'stage-123';

    const mockDto: CreateFlowItemDto = {
      title: 'Item Teste',
      productRef: 'REF-001',
      quantity: 5,
      priority: 3,
      description: 'Descrição teste',
    };

    const mockUser = {
      id: 'user-123',
      role: 'USER',
      professionalRole: 'costureiro',
    };

    const mockStage = {
      id: 'stage-123',
      name: 'Etapa Inicial',
      allowedRole: null,
    };

    const mockExistingItem = null;
    const mockLastItem = { orderInStage: 5 };
    const mockCreatedItem = {
      id: 'item-123',
      ...mockDto,
      flowId: mockFlowId,
      companyId: mockCompanyId,
      stageId: mockStageId,
      orderInStage: 6,
    };

    beforeEach(() => {
      mockClsService.get.mockReturnValue(mockCompanyId);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.flowItem.findFirst
        .mockResolvedValueOnce(mockExistingItem) // Para validação de duplicidade
        .mockResolvedValueOnce(mockLastItem); // Para buscar último item da stage
      mockPrisma.flowStage.findFirst.mockResolvedValue(mockStage);
      mockPrisma.flowItem.create.mockResolvedValue(mockCreatedItem);
      mockAuditService.log.mockResolvedValue(undefined);
      mockCacheManager.del.mockResolvedValue(undefined);
    });

    it('should create a flow item successfully', async () => {
      const result = await service.createFlowItem(
        mockFlowId,
        mockUserId,
        mockDto,
      );

      expect(result).toEqual(mockCreatedItem);
      expect(mockPrisma.user.findFirst).toHaveBeenCalled();
      expect(mockPrisma.flowItem.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.flowStage.findFirst).toHaveBeenCalled();
      expect(mockPrisma.flowItem.create).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createFlowItem(mockFlowId, mockUserId, mockDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when stage not found', async () => {
      mockPrisma.flowStage.findFirst.mockResolvedValue(null);

      await expect(
        service.createFlowItem(mockFlowId, mockUserId, mockDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when title already exists', async () => {
      mockPrisma.flowItem.findFirst.mockResolvedValueOnce({
        id: 'other-item',
        title: mockDto.title,
      });

      await expect(
        service.createFlowItem(mockFlowId, mockUserId, mockDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when productRef already exists', async () => {
      mockPrisma.flowItem.findFirst.mockResolvedValueOnce({
        id: 'other-item',
        productRef: mockDto.productRef,
      });

      await expect(
        service.createFlowItem(mockFlowId, mockUserId, mockDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use default quantity 1 when not provided', async () => {
      const dtoWithoutQuantity = { ...mockDto, quantity: undefined };

      await service.createFlowItem(mockFlowId, mockUserId, dtoWithoutQuantity);

      expect(mockPrisma.flowItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: 1,
          }),
        }),
      );
    });

    it('should use default priority 3 when not provided', async () => {
      const dtoWithoutPriority = { ...mockDto, priority: undefined };

      await service.createFlowItem(mockFlowId, mockUserId, dtoWithoutPriority);

      expect(mockPrisma.flowItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 3,
          }),
        }),
      );
    });
  });

  describe('updateFlowItem', () => {
    const mockCompanyId = 'company-123';
    const mockItemId = 'item-123';
    const mockUserId = 'user-123';

    const mockItem = {
      id: mockItemId,
      title: 'Título Antigo',
      productRef: 'REF-001',
      quantity: 5,
      description: 'Descrição antiga',
      priority: 3,
      stageId: 'stage-123',
      flowId: 'flow-123',
      companyId: mockCompanyId,
      stage: { id: 'stage-123', name: 'Etapa 1', allowedRole: null },
    };

    const mockUser = {
      id: mockUserId,
      role: 'USER',
      name: 'Usuário Teste',
      professionalRole: 'costureiro',
    };

    const mockUpdateData = {
      title: 'Título Novo',
      description: 'Descrição nova',
      quantity: 10,
    };

    const mockUpdatedItem = {
      ...mockItem,
      ...mockUpdateData,
    };

    beforeEach(() => {
      mockClsService.get.mockReturnValue(mockCompanyId);
      mockPrisma.flowItem.findFirst
        .mockResolvedValueOnce(mockItem) // Para buscar o item
        .mockResolvedValueOnce(null); // Para validação de duplicidade (nenhum item encontrado)
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.flowItem.update.mockResolvedValue(mockUpdatedItem);
      mockAuditService.log.mockResolvedValue(undefined);
      mockCacheManager.del.mockResolvedValue(undefined);
    });

    it('should update a flow item successfully', async () => {
      const result = await service.updateFlowItem(
        mockItemId,
        mockUserId,
        mockUpdateData,
      );

      expect(result).toEqual(mockUpdatedItem);
      expect(mockPrisma.flowItem.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.user.findFirst).toHaveBeenCalled();
      expect(mockPrisma.flowItem.update).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when item not found', async () => {
      mockPrisma.flowItem.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateFlowItem(mockItemId, mockUserId, mockUpdateData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateFlowItem(mockItemId, mockUserId, mockUpdateData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when title already exists', async () => {
      mockPrisma.flowItem.findFirst
        .mockResolvedValueOnce(mockItem) // Primeira chamada: busca o item
        .mockResolvedValueOnce({
          // Segunda chamada: validação de duplicidade
          id: 'other-item',
          title: mockUpdateData.title,
        });

      await expect(
        service.updateFlowItem(mockItemId, mockUserId, mockUpdateData),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow admin to update without access validation', async () => {
      const adminUser = { ...mockUser, role: 'ADMIN' };
      mockPrisma.user.findFirst.mockResolvedValue(adminUser);

      const result = await service.updateFlowItem(
        mockItemId,
        mockUserId,
        mockUpdateData,
      );

      expect(result).toBeDefined();
    });

    it('should validate quantity when item passed corte stage', async () => {
      const itemWithCorte = {
        ...mockItem,
        stageId: 'stage-after-corte',
      };

      const sortedStages = [
        { id: 'stage-1', order: 1, name: 'Início' },
        { id: 'stage-2', order: 2, name: 'Corte' },
        { id: 'stage-3', order: 3, name: 'Pós-Corte' },
      ];

      mockPrisma.flowItem.findFirst.mockResolvedValueOnce(itemWithCorte);
      mockPrisma.flowStage.findMany.mockResolvedValue(sortedStages);

      const updateData = { quantity: 0 };

      await expect(
        service.updateFlowItem(mockItemId, mockUserId, updateData),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFlows', () => {
    const mockCompanyId = 'company-123';
    const mockFlows = [
      {
        id: 'flow-1',
        name: 'Fluxo 1',
        deadline: new Date('2024-12-31'),
        stages: [],
        _count: { items: 5, stages: 3 },
      },
      {
        id: 'flow-2',
        name: 'Fluxo 2',
        deadline: null,
        stages: [],
        _count: { items: 2, stages: 2 },
      },
    ];

    beforeEach(() => {
      mockClsService.get.mockReturnValue(mockCompanyId);
      mockPrisma.productFlow.findMany.mockResolvedValue(mockFlows);
      mockCacheManager.get.mockResolvedValue(null);
    });

    it('should return cached flows if available', async () => {
      const cachedFlows = [{ id: 'cached-flow' }];
      mockCacheManager.get.mockResolvedValue(cachedFlows);

      const result = await service.getFlows();

      expect(result).toEqual(cachedFlows);
      expect(mockPrisma.productFlow.findMany).not.toHaveBeenCalled();
    });

    it('should fetch and cache flows when cache is empty', async () => {
      const result = await service.getFlows();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('daysRemaining');
      expect(result[0]).toHaveProperty('deadlineStatus');
      expect(result[0]).toHaveProperty('deadlineFormatted');
      expect(mockPrisma.productFlow.findMany).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should calculate deadline status correctly', async () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 5);

      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - 5);

      const flowsWithDates = [
        {
          ...mockFlows[0],
          deadline: futureDate,
        },
        {
          ...mockFlows[0],
          deadline: pastDate,
        },
      ];

      mockPrisma.productFlow.findMany.mockResolvedValue(flowsWithDates);

      const result = await service.getFlows();

      expect(result[0].deadlineStatus).toBe('normal');
      expect(result[1].deadlineStatus).toBe('expired');
    });
  });

  describe('validateQuantityBeforeMove', () => {
    const mockCompanyId = 'company-123';
    const mockItemId = 'item-123';
    const mockTargetStageId = 'stage-456';
    const mockUserId = 'user-123';

    const mockItem = {
      id: mockItemId,
      quantity: 5,
      stageId: 'stage-123',
      flow: {
        stages: [
          { id: 'stage-123', order: 1, name: 'Início' },
          { id: 'stage-456', order: 2, name: 'Corte' },
          { id: 'stage-789', order: 3, name: 'Pós-Corte' },
        ],
      },
    };

    const mockUser = {
      role: 'USER',
      name: 'Usuário',
    };

    const mockTargetStage = {
      id: 'stage-456',
      name: 'Corte',
    };

    beforeEach(() => {
      mockPrisma.flowItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.flowStage.findFirst.mockResolvedValue(mockTargetStage);
    });

    it('should pass validation for valid quantity', async () => {
      await expect(
        (service as any).validateQuantityBeforeMove(
          mockItemId,
          mockTargetStageId,
          mockCompanyId,
          mockUserId,
        ),
      ).resolves.not.toThrow();
    });

    it('should throw error when moving to after corte with zero quantity', async () => {
      const itemWithZeroQuantity = {
        ...mockItem,
        quantity: 0,
      };
      mockPrisma.flowItem.findFirst.mockResolvedValue(itemWithZeroQuantity);

      await expect(
        (service as any).validateQuantityBeforeMove(
          mockItemId,
          mockTargetStageId,
          mockCompanyId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when moving from after corte with undefined quantity', async () => {
      const itemFromAfterCorte = {
        ...mockItem,
        stageId: 'stage-789', // Depois do corte
        quantity: undefined,
      };
      mockPrisma.flowItem.findFirst.mockResolvedValue(itemFromAfterCorte);

      await expect(
        (service as any).validateQuantityBeforeMove(
          mockItemId,
          mockTargetStageId,
          mockCompanyId,
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip validation when no corte stage exists', async () => {
      const itemWithoutCorte = {
        ...mockItem,
        flow: {
          stages: [
            { id: 'stage-123', order: 1, name: 'Início' },
            { id: 'stage-456', order: 2, name: 'Meio' },
            { id: 'stage-789', order: 3, name: 'Fim' },
          ],
        },
      };
      mockPrisma.flowItem.findFirst.mockResolvedValue(itemWithoutCorte);

      await expect(
        (service as any).validateQuantityBeforeMove(
          mockItemId,
          mockTargetStageId,
          mockCompanyId,
          mockUserId,
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('deleteItem', () => {
    const mockCompanyId = 'company-123';
    const mockItemId = 'item-123';
    const mockUserId = 'user-123';
    const mockFlowId = 'flow-123';

    const mockItem = {
      id: mockItemId,
      title: 'Item para deletar',
      flowId: mockFlowId,
      stageId: 'stage-123',
      orderNumber: 'ORD-001',
      productRef: 'REF-001',
      images: [{ url: 'image.jpg' }],
      audios: [],
      videos: [],
    };

    beforeEach(() => {
      mockClsService.get.mockReturnValue(mockCompanyId);
      mockPrisma.flowItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.flowItem.delete.mockResolvedValue(mockItem);
      mockSupabaseService.deleteFlowFile.mockResolvedValue(undefined);
      mockAuditService.log.mockResolvedValue(undefined);
      mockCacheManager.del.mockResolvedValue(undefined);
    });

    it('should delete item and its media successfully', async () => {
      const result = await service.deleteItem(mockItemId, mockUserId);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.flowItem.findFirst).toHaveBeenCalled();
      expect(mockSupabaseService.deleteFlowFile).toHaveBeenCalledWith(
        'image.jpg',
      );
      expect(mockPrisma.flowItem.delete).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when item not found', async () => {
      mockPrisma.flowItem.findFirst.mockResolvedValue(null);

      await expect(service.deleteItem(mockItemId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFilteredItems', () => {
    const mockCompanyId = 'company-123';
    const mockFilters = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      dateType: 'dueDate',
      status: 'PENDENTE',
      productRef: 'REF',
    };

    const mockItems = [
      {
        id: 'item-1',
        title: 'Item 1',
        dueDate: new Date('2024-06-01'),
      },
    ];

    beforeEach(() => {
      mockClsService.get.mockReturnValue(mockCompanyId);
      mockPrisma.flowItem.findMany.mockResolvedValue(mockItems);
    });

    it('should return filtered items', async () => {
      const result = await service.getFilteredItems(mockFilters as any);

      expect(result).toEqual(mockItems);
      expect(mockPrisma.flowItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: mockCompanyId,
          }),
        }),
      );
    });

    it('should handle overdue filter', async () => {
      const overdueFilters = { ...mockFilters, isOverdue: 'true' };

      await service.getFilteredItems(overdueFilters as any);

      expect(mockPrisma.flowItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                dueDate: expect.objectContaining({ not: null }),
              }),
            ]),
          }),
        }),
      );
    });

    it('should handle upcoming filter', async () => {
      const upcomingFilters = { ...mockFilters, isUpcoming: 'true' };

      await service.getFilteredItems(upcomingFilters as any);

      expect(mockPrisma.flowItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                productionStartedAt: expect.objectContaining({ not: null }),
              }),
            ]),
          }),
        }),
      );
    });
  });
});
