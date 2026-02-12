/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { ClsService } from 'nestjs-cls';

describe('PrismaService (Multi-tenant Extension)', () => {
  let service: PrismaService;
  let clsService: ClsService;

  // Mock da função de query original do Prisma
  const mockQuery = jest.fn((args) => Promise.resolve(args));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ClsService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    clsService = module.get<ClsService>(ClsService);

    // 1. Registrar modelos no Set de validação
    const availableModels = (service as any).availableModels as Set<string>;
    availableModels.add('user');
    availableModels.add('company');

    // 2. Mock dos delegates (Modelos) na instância do serviço
    (service as any).user = {
      findFirst: jest.fn().mockImplementation(mockQuery),
      findMany: jest.fn().mockImplementation(mockQuery),
      create: jest.fn().mockImplementation(mockQuery),
    };

    (service as any).company = {
      findFirst: jest.fn().mockImplementation(mockQuery),
      findFirstOrThrow: jest.fn().mockImplementation(mockQuery),
    };

    // 3. Mock do $extends para interceptar chamadas do "extended"
    jest.spyOn(service, '$extends').mockImplementation(((ext: any) => {
      const allOps = ext.query.$allModels.$allOperations;
      return {
        user: {
          findMany: (args: any) => allOps({ model: 'User', operation: 'findMany', args, query: mockQuery }),
          create: (args: any) => allOps({ model: 'User', operation: 'create', args, query: mockQuery }),
          findUnique: (args: any) => allOps({ model: 'User', operation: 'findUnique', args, query: mockQuery }),
        },
        company: {
          findUnique: (args: any) => allOps({ model: 'Company', operation: 'findUnique', args, query: mockQuery }),
        },
      };
    }) as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve injetar tenantId e userId em operações de criação', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'tenantId') return 'tenant-123';
      if (key === 'userId') return 'user-456';
      return false;
    });

    const result: any = await service.extended.user.create({ data: { name: 'João' } as any });

    expect(result.data).toMatchObject({
      companyId: 'tenant-123',
      userCreateId: 'user-456',
    });
  });

  it('deve filtrar por companyId em buscas (findMany)', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'tenantId') return 'tenant-123';
      return false;
    });

    const result: any = await service.extended.user.findMany({ where: { active: true } as any });
    expect(result.where).toEqual({ active: true, companyId: 'tenant-123' });
  });

  it('não deve injetar filtros se o usuário for Master', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => key === 'isMaster');

    const result: any = await service.extended.user.findMany({ where: { active: true } as any });
    expect(result.where).toEqual({ active: true });
    expect(result.where.companyId).toBeUndefined();
  });

  it('deve converter findUnique para findFirst e filtrar por ID se o modelo for Company', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => (key === 'tenantId' ? 'tenant-123' : false));

    await service.extended.company.findUnique({ where: { id: 'any' } });

    expect((service as any).company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-123' } })
    );
  });

  it('deve injetar companyId em vez de ID se o modelo não for Company (ex: User)', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => (key === 'tenantId' ? 'tenant-123' : false));

    // Chamamos findUnique no model user
    await service.extended.user.findUnique({ where: { email: 'test@test.com' } });

    // Verificamos se foi convertido para findFirst no model user com companyId
    expect((service as any).user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'test@test.com', companyId: 'tenant-123' }
      })
    );
  });
});
