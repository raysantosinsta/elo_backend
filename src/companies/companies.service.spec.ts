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
  RequestTimeoutException,
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

  const mockCounter = { inc: jest.fn() };
  const mockHistogram = {
    labels: jest.fn().mockReturnThis(),
    startTimer: jest.fn().mockReturnValue(jest.fn()),
  };

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
            company: { findUnique: jest.fn() },
            extended: mockPrismaExtended,
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

    jest.clearAllMocks();
  });

  // create()
  describe('create()', () => {
    const createDto = { cnpj: '12345678000199', name: 'Empresa Teste' };

    it('deve criar uma empresa com sucesso e incrementar métrica', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      mockPrismaExtended.company.create.mockResolvedValue({
        id: 'uuid-test',
        ...createDto,
        status: SimpleStatus.ACTIVE,
      });

      const result = await service.create(createDto as any);

      expect(result.id).toBe('uuid-test');
      expect(mockCounter.inc).toHaveBeenCalledTimes(1);
    });

    it('deve falhar se o CNPJ já existir', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'existente' });

      await expect(service.create(createDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  // findAll()
  describe('findAll()', () => {
    const pagination = { page: 1, limit: 10 };

    it('deve retornar do cache se disponível', async () => {
      const cached = { data: [], total: 0, page: 1, lastPage: 0 };
      cache.get.mockResolvedValue(cached);

      const result = await service.findAll(pagination);

      expect(result).toEqual(cached);
      expect(mockPrismaExtended.company.findMany).not.toHaveBeenCalled();
    });

    it('deve buscar do banco, calcular lastPage e salvar no cache', async () => {
      cache.get.mockResolvedValue(null);
      jest.spyOn(cls, 'get').mockImplementation((key) => key === 'isMaster');

      mockPrismaExtended.company.findMany.mockResolvedValue([{ id: '1', name: 'Test' }]);
      mockPrismaExtended.company.count.mockResolvedValue(5);

      const result = await service.findAll(pagination);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(5);
      expect(result.lastPage).toBe(1);
      expect(cache.set).toHaveBeenCalled();
    });
  });

  // findOne()
  describe('findOne()', () => {
    it('deve retornar empresa e salvar no cache', async () => {
      cache.get.mockResolvedValue(null);
      mockPrismaExtended.company.findUnique.mockResolvedValue({ id: '123', name: 'Empresa' });

      const result = await service.findOne('123');

      expect(result.id).toBe('123');
      expect(cache.set).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se não encontrar', async () => {
      mockPrismaExtended.company.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalido')).rejects.toThrow(NotFoundException);
    });
  });

  // update()
  describe('update()', () => {
    const companyId = 'id-123';
    const existing = { id: companyId, cnpj: '111', status: 'ACTIVE' };

    it('deve impedir alteração de campos sensíveis por non-master', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as Company);
      jest.spyOn(cls, 'get').mockReturnValue(false);

      await expect(
        service.update(companyId, { status: SimpleStatus.INACTIVE }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve permitir master alterar qualquer campo', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as Company);
      jest.spyOn(cls, 'get').mockReturnValue(true);
      mockPrismaExtended.company.update.mockResolvedValue({ ...existing, name: 'Novo' });

      const result = await service.update(companyId, { name: 'Novo' });

      expect(result.name).toBe('Novo');
      expect(cache.del).toHaveBeenCalled();
    });
  });

  // remove()
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

  // RESILIÊNCIA
  describe('executeWithResilience - retry logic', () => {
    beforeEach(() => {
      // Silencia logs durante testes de falha (opcional, mas deixa o output limpo)
      jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
    });

    it('deve retry e sucesso na segunda tentativa', async () => {
      mockPrismaExtended.company.findUnique
        .mockRejectedValueOnce(
          Object.assign(new Error('Timed out fetching a new connection'), {
            name: 'PrismaClientKnownRequestError',
            code: 'P2024',
            message: 'Timed out fetching a new connection from the connection pool',
            meta: { connection_timeout: 10000 },
          })
        )
        .mockResolvedValueOnce({ id: 'sucesso-retry' });

      const result = await service.findOne('id-retry');

      expect(result.id).toBe('sucesso-retry');
      expect(mockPrismaExtended.company.findUnique).toHaveBeenCalledTimes(2);
    });

    it('deve falhar após 3 tentativas e lançar RequestTimeoutException', async () => {
      mockPrismaExtended.company.findUnique.mockRejectedValue(
        Object.assign(new Error('Timed out fetching a new connection'), {
          name: 'PrismaClientKnownRequestError',
          code: 'P2024',
          message: 'Timed out fetching a new connection from the connection pool',
          meta: undefined,
        })
      );

      await expect(service.findOne('id-falha')).rejects.toThrow(RequestTimeoutException);

      expect(mockPrismaExtended.company.findUnique).toHaveBeenCalledTimes(3);
    });
  });
});