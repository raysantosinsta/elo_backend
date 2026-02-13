/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { NotFoundException } from '@nestjs/common';
import { SimpleStatus } from '@prisma/client';

describe('ProductsService', () => {
  let service: ProductsService;
  let cls: ClsService;

  // Mock do cliente estendido do Prisma
  const mockPrismaExtended = {
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    productMaterial: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: {
            extended: mockPrismaExtended,
          },
        },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    cls = module.get<ClsService>(ClsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('deve criar um produto com materiais injetando IDs de auditoria', async () => {
      const createDto = {
        name: 'Produto Teste',
        materials: [{ materialId: 'mat-1', quantidade: 10 }],
      };

      jest.spyOn(cls, 'get').mockImplementation((key) => {
        if (key === 'userId') return 'user-123';
        if (key === 'tenantId') return 'tenant-456';
        return null;
      });

      mockPrismaExtended.product.create.mockResolvedValue({ id: 'prod-1', ...createDto });

      const result = await service.create(createDto as any);

      expect(mockPrismaExtended.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Produto Teste',
          companyId: 'tenant-456',
          materials: {
            create: [
              {
                materialId: 'mat-1',
                quantidade: 10,
                userCreateId: 'user-123',
                userUpdateId: 'user-123',
              },
            ],
          },
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('prod-1');
    });
  });

  describe('findAll()', () => {
    it('deve retornar produtos paginados', async () => {
      mockPrismaExtended.product.count.mockResolvedValue(1);
      mockPrismaExtended.product.findMany.mockResolvedValue([{ id: 'prod-1', name: 'Teste' }]);

      const result = await service.findAll(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaExtended.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      );
    });
  });

  describe('findOne()', () => {
    it('deve retornar um produto se encontrado', async () => {
      mockPrismaExtended.product.findUnique.mockResolvedValue({ id: 'prod-1' });

      const result = await service.findOne('prod-1');

      expect(result.id).toBe('prod-1');
    });

    it('deve lançar NotFoundException se não encontrar', async () => {
      mockPrismaExtended.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('deve atualizar dados e resetar materiais', async () => {
      jest.spyOn(cls, 'get').mockReturnValue('user-123');
      mockPrismaExtended.product.update.mockResolvedValue({ id: 'prod-1' });

      await service.update('prod-1', { 
        name: 'Novo Nome', 
        materials: [{ materialId: 'mat-2', quantidade: 5 }] 
      } as any);

      expect(mockPrismaExtended.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({
            materials: {
              deleteMany: {},
              create: [expect.objectContaining({ materialId: 'mat-2', userCreateId: 'user-123' })],
            },
          }),
        })
      );
    });
  });

  describe('addMaterial()', () => {
    it('deve fazer upsert do material com auditoria manual', async () => {
      // Mock do findOne interno
      mockPrismaExtended.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      jest.spyOn(cls, 'get').mockReturnValue('user-123');
      
      await service.addMaterial('prod-1', 'mat-1', 5);

      expect(mockPrismaExtended.productMaterial.upsert).toHaveBeenCalledWith({
        where: { productId_materialId: { productId: 'prod-1', materialId: 'mat-1' } },
        update: expect.objectContaining({ userUpdateId: 'user-123' }),
        create: expect.objectContaining({
          userCreateId: 'user-123',
          userUpdateId: 'user-123',
        }),
      });
    });
  });

  describe('remove()', () => {
    it('deve realizar soft delete alterando o status', async () => {
      await service.remove('prod-1');

      expect(mockPrismaExtended.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { status: SimpleStatus.INACTIVE },
      });
    });
  });
});