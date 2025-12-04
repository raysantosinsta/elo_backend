import { Injectable, NotFoundException } from '@nestjs/common';
import { Company } from '@prisma/client'; // Importe o tipo Company do Prisma Client
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CompaniesService {
  // 1. Injetar o PrismaService
  constructor(private prisma: PrismaService) {}

  /**
   * C - Create
   * Cria uma nova empresa no banco de dados.
   * Assume que o DTO contém todos os campos necessários do modelo Company, exceto `id`, `createdAt`, `updatedAt` e relacionamentos.
   */
  async create(createCompanyDto: any): Promise<Company> {
    // Você pode precisar mapear os campos do DTO para o formato do Prisma (ex: `name` para `nome` se o DTO não usar a notação do banco)
    // Se o seu DTO CreateCompanyDto já estiver mapeado corretamente para os campos do modelo Prisma (camelCase), use-o diretamente.
    const {
      name,
      cnpj,
      telefone,
      email,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      ramoAtividade,
      userCreateId, // Assumindo que o ID do usuário criador vem no DTO
      status, // Opcional, se não for ATIVO por padrão
    } = createCompanyDto;

    return this.prisma.company.create({
      data: {
        // Mapeamento dos campos: DTO -> Modelo Prisma
        name,
        cnpj,
        telefone,
        email,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep,
        ramoAtividade,
        userCreateId,
        status,
        // Campos que possuem default() no schema serão preenchidos automaticamente pelo Prisma
      },
    });
  }

  /**
   * R - Read (All)
   * Retorna todas as empresas ativas, opcionalmente incluindo usuários (membros).
   */
  async findAll(): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: {
        status: 'ATIVO', // Filtrando apenas empresas ativas
      },
      // Exemplo de inclusão de relacionamentos, se necessário:
      // include: {
      //   users: true, // Inclui todos os usuários (membros) da empresa
      // },
    });
  }

  /**
   * R - Read (One)
   * Retorna uma única empresa pelo ID.
   */
  async findOne(id: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      // include: { users: true }, // Incluir dados de relacionamento se necessário
    });

    if (!company) {
      throw new NotFoundException(`Empresa com ID ${id} não encontrada.`);
    }

    return company;
  }

  /**
   * U - Update
   * Atualiza os dados de uma empresa existente.
   * O DTO pode ser parcial (Partial Type) para permitir atualizações parciais.
   */
  async update(id: string, updateCompanyDto: any): Promise<Company> {
    // Verificar se a empresa existe
    await this.findOne(id); // Reusa o findOne para lançar NotFoundException se não existir

    // O DTO pode ser usado diretamente, o Prisma só atualiza os campos presentes.
    const {
      name,
      cnpj,
      telefone,
      email,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      ramoAtividade,
      userUpdateId, // Assumindo que o ID do usuário que está atualizando vem no DTO
      status,
    } = updateCompanyDto;

    return this.prisma.company.update({
      where: { id },
      data: {
        // Mapeamento dos campos: DTO -> Modelo Prisma
        name,
        cnpj,
        telefone,
        email,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep,
        ramoAtividade,
        userUpdateId,
        status,
        // O campo 'updatedAt' será atualizado automaticamente com @updatedAt
      },
    });
  }

  /**
   * D - Delete (Hard Delete / Exclusão física)
   * Remove a empresa do banco de dados pelo ID.
   *
   * *Atenção:* Em sistemas reais, é comum usar um "Soft Delete" (mudança de status, ex: INATIVO)
   * em vez de exclusão física, devido aos relacionamentos.
   * Se for usar Soft Delete, ajuste para:
   *
   * async remove(id: string): Promise<Company> {
   * return this.prisma.company.update({
   * where: { id },
   * data: { status: 'INATIVO' as any }, // 'as any' pode ser necessário dependendo da tipagem do Prisma
   * });
   * }
   *
   * Vou manter o Hard Delete original, mas com o ID como `string`.
   */
  async remove(id: string): Promise<Company> {
    // Verificar se a empresa existe antes de tentar deletar
    await this.findOne(id);

    return this.prisma.company.delete({
      where: { id },
    });
  }
}