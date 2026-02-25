/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { 
  ConflictException, 
  ForbiddenException, 
  NotFoundException 
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Mock do bcrypt para evitar erro de redefinição de propriedade (Read-only)
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let cls: ClsService;

  // Mock do Prisma Estendido (this.db)
  const mockPrismaExtended = {
    user: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: { extended: mockPrismaExtended },
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    cls = module.get<ClsService>(ClsService);
    
    // Resetar mocks e definir retorno padrão do hash
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
  });

  // --- 1. TESTE DE DEFINIÇÃO ---
  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 2. TESTES DE CRIAÇÃO ---
  describe('createUser()', () => {
    const createDto = {
      email: 'test@test.com',
      password: 'password123',
      name: 'Test User',
    };

    it('deve fazer hash da senha com 12 rounds e criar como EMPLOYER por padrão', async () => {
      jest.spyOn(cls, 'get').mockImplementation((key) => {
        if (key === 'isMaster') return false;
        if (key === 'tenantId') return 'company-123';
        return null;
      });

      mockPrismaExtended.user.create.mockResolvedValue({ id: '1', ...createDto });

      await service.createUser(createDto as any);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockPrismaExtended.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.EMPLOYER,
            companyId: 'company-123',
          }),
        })
      );
    });

    it('deve permitir que Master crie um ADMIN em empresa específica', async () => {
      jest.spyOn(cls, 'get').mockReturnValue(true); // isMaster = true
      mockPrismaExtended.user.create.mockResolvedValue({ id: '1' });

      await service.createUser({ ...createDto, companyId: 'target-company' } as any);

      expect(mockPrismaExtended.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.ADMIN,
            companyId: 'target-company',
          }),
        })
      );
    });

    it('deve lançar ConflictException em caso de email duplicado (P2002)', async () => {
      mockPrismaExtended.user.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.createUser(createDto as any)).rejects.toThrow(ConflictException);
    });
  });

  // --- 3. TESTES DE ATUALIZAÇÃO ---
  describe('updateUser()', () => {
    const userId = 'user-123';
    const existingUser = { id: userId, companyId: 'tenant-1' };

    it('deve ignorar alteração de ROLE se o usuário não for Master', async () => {
      jest.spyOn(cls, 'get').mockReturnValue(false); 
      mockPrismaExtended.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaExtended.user.update.mockResolvedValue(existingUser);

      await service.updateUser({ id: userId, role: UserRole.ADMIN } as any);

      expect(mockPrismaExtended.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ role: UserRole.ADMIN }),
        })
      );
    });
  });

  // --- 4. TESTES DE BUSCA ---
  describe('findUsersByCompany()', () => {
    it('deve bloquear ADMIN de ver usuários de outro tenant', async () => {
      jest.spyOn(cls, 'get').mockImplementation((key) => {
        if (key === 'isMaster') return false;
        if (key === 'tenantId') return 'company-A';
        return null;
      });

      await expect(service.findUsersByCompany('company-B'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('findUserById()', () => {
    it('deve lançar NotFoundException se o usuário não for encontrado', async () => {
      mockPrismaExtended.user.findUnique.mockResolvedValue(null);
      await expect(service.findUserById('id')).rejects.toThrow(NotFoundException);
    });
  });
});