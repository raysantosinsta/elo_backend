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

  // Mock do objeto de query do Prisma
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

    // Mock simples para o $extends não quebrar durante os testes
    jest.spyOn(service, '$extends').mockImplementation(((ext: any) => {
      // Simula a execução da lógica da extensão
      return {
        user: {
          findMany: (args: any) => ext.query.$allModels.$allOperations({
            model: 'User',
            operation: 'findMany',
            args,
            query: mockQuery,
          }),
          create: (args: any) => ext.query.$allModels.$allOperations({
            model: 'User',
            operation: 'create',
            args,
            query: mockQuery,
          }),
        },
        company: {
          findUnique: (args: any) => ext.query.$allModels.$allOperations({
            model: 'Company',
            operation: 'findUnique',
            args,
            query: mockQuery,
          }),
        }
      };
    }) as any);
  });

  it('deve injetar tenantId e userId em operações de criação', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'tenantId') return 'tenant-123';
      if (key === 'userId') return 'user-456';
      return false;
    });

    const result = await service.extended.user.create({
      data: { name: 'João' },
    });

    expect(result.data).toEqual({
      name: 'João',
      companyId: 'tenant-123', // Multi-tenant
      userCreateId: 'user-456', // Auditoria
      userUpdateId: 'user-456', // Auditoria
    });
  });

  it('deve filtrar por companyId em buscas (findMany)', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'tenantId') return 'tenant-123';
      return false;
    });

    const result = await service.extended.user.findMany({
      where: { active: true },
    });

    expect(result.where).toEqual({
      active: true,
      companyId: 'tenant-123',
    });
  });

  it('não deve injetar filtros se o usuário for Master', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'isMaster') return true;
      return null;
    });

    const result = await service.extended.user.findMany({
      where: { active: true },
    });

    // Como é master, o where original não deve ser alterado
    expect(result.where).toEqual({ active: true });
    expect(result.where.companyId).toBeUndefined();
  });

  it('deve converter findUnique para findFirst para injetar o filtro de tenant', async () => {
    jest.spyOn(clsService, 'get').mockImplementation((key) => {
      if (key === 'tenantId') return 'tenant-123';
      return false;
    });

    // Mock do delegate do Prisma para findFirstOrThrow (usado na conversão)
    (service as any).company = {
      findFirst: jest.fn().mockResolvedValue({ id: 'tenant-123' }),
    };

    await service.extended.company.findUnique({
      where: { id: 'tenant-123' },
    });

    expect((service as any).company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-123' },
      }),
    );
  });
});