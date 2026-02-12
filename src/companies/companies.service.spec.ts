/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SimpleStatus, Company } from '@prisma/client';
import { getToken } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: PrismaService;
  let cls: ClsService;
  let cache: any;

  // --- Mocks para Prometheus ---
  const mockCounter = { inc: jest.fn() };
  const mockHistogram = {
    labels: jest.fn().mockReturnThis(),
    startTimer: jest.fn().mockReturnValue(jest.fn()),
  };

  // --- Mock do Prisma Estendido (this.db) ---
  const mockPrismaExtended = {
    company: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: {
            company: { findUnique: jest.fn() }, // Cliente base para check de CNPJ global
            extended: mockPrismaExtended,      // Getter do cliente estendido
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn() },
        },
        { provide: getToken('company_created_total'), useValue: mockCounter },
        {
          provide: getToken('db_operation_duration_seconds'),
          useValue: mockHistogram,
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    prisma = module.get<PrismaService>(PrismaService);
    cls = module.get<ClsService>(ClsService);
    cache = module.get(CACHE_MANAGER);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. CREATE
  // ===========================================================================
  describe('create()', () => {
    const createDto = { cnpj: '12345678000199', name: 'Empresa Teste' };

    it('deve criar uma empresa com sucesso e incrementar métrica', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      mockPrismaExtended.company.create.mockResolvedValue({
        id: 'uuid',
        ...createDto,
      });

      const result = await service.create(createDto as any);

      expect(result.id).toBe('uuid');
      expect(mockCounter.inc).toHaveBeenCalled(); // Validando a correção sugerida
      expect(mockPrismaExtended.company.create).toHaveBeenCalled();
    });

    it('deve falhar se o CNPJ já existir no banco global', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'existente',
      });

      await expect(service.create(createDto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================================================
  // 2. FIND ALL
  // ===========================================================================
  describe('findAll()', () => {
    const pagination = { page: 1, limit: 10 };

    it('deve retornar dados do cache se disponíveis', async () => {
      const cached = { data: [], total: 0, page: 1, lastPage: 0 };
      cache.get.mockResolvedValue(cached);

      const result = await service.findAll(pagination);

      expect(result).toEqual(cached);
      expect(mockPrismaExtended.company.findMany).not.toHaveBeenCalled();
    });

    it('deve buscar do banco, calcular lastPage e salvar no cache', async () => {
      cache.get.mockResolvedValue(null);
      jest.spyOn(cls, 'get').mockImplementation((key) => key === 'isMaster');
      
      mockPrismaExtended.company.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaExtended.company.count.mockResolvedValue(1);

      const result = await service.findAll(pagination);

      expect(result.data).toHaveLength(1);
      expect(result.lastPage).toBe(1);
      expect(cache.set).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 3. FIND ONE
  // ===========================================================================
  describe('findOne()', () => {
    it('deve retornar empresa e salvar no cache', async () => {
      cache.get.mockResolvedValue(null);
      mockPrismaExtended.company.findUnique.mockResolvedValue({ id: '123' });

      const result = await service.findOne('123');

      expect(result.id).toBe('123');
      expect(cache.set).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se o banco retornar null', async () => {
      mockPrismaExtended.company.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalido')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // 4. UPDATE
  // ===========================================================================
  describe('update()', () => {
    const companyId = 'id-123';
    const existing = { id: companyId, cnpj: '111', status: 'ACTIVE' };

    it('deve impedir que ADMIN altere campos sensíveis', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as Company);
      jest.spyOn(cls, 'get').mockReturnValue(false); // isMaster = false

      await expect(
        service.update(companyId, { status: SimpleStatus.INACTIVE }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve permitir que MASTER altere qualquer campo', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as Company);
      jest.spyOn(cls, 'get').mockReturnValue(true); // isMaster = true
      mockPrismaExtended.company.update.mockResolvedValue({
        ...existing,
        name: 'Novo Nome',
      });

      const result = await service.update(companyId, { name: 'Novo Nome' });

      expect(result.name).toBe('Novo Nome');
      expect(cache.del).toHaveBeenCalledWith(`company_${companyId}`);
    });
  });

  // ===========================================================================
  // 5. REMOVE
  // ===========================================================================
  describe('remove()', () => {
    it('deve realizar soft delete se for Master', async () => {
      jest.spyOn(cls, 'get').mockReturnValue(true);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1' } as Company);

      await service.remove('1');

      expect(mockPrismaExtended.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SimpleStatus.INACTIVE } }),
      );
    });
  });

  // ===========================================================================
  // 6. RESILIÊNCIA & RETRY
  // ===========================================================================
  describe('executeWithResilience()', () => {
    it('deve tentar novamente em caso de falha temporária', async () => {
      mockPrismaExtended.company.findUnique
        .mockRejectedValueOnce(new Error('P2008')) // Simula erro de timeout/abort do Prisma
        .mockResolvedValueOnce({ id: 'sucesso' });

      const result = await service.findOne('id');

      expect(result.id).toBe('sucesso');
      expect(mockPrismaExtended.company.findUnique).toHaveBeenCalledTimes(2);
    });

    it('deve falhar após o número máximo de tentativas', async () => {
      mockPrismaExtended.company.findUnique.mockRejectedValue(
        new Error('Database Down'),
      );

      await expect(service.findOne('id')).rejects.toThrow();
      expect(mockPrismaExtended.company.findUnique).toHaveBeenCalledTimes(3);
    });
  });
});