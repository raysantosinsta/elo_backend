import { PrismaClient, UserRole, SupplierCategory } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando o seed...')

  // -------------------------------------------------------
  // 1. CRIAR USUÁRIO MASTER (Necessário para userCreate)
  // -------------------------------------------------------
  const user = await prisma.user.upsert({
    where: { email: 'admin@exemplo.com' },
    update: {},
    create: {
      name: 'Admin Master',
      email: 'admin@exemplo.com',
      password: 'senha123', // Em produção, use bcrypt ou argon2
      role: UserRole.MASTER,
      contact: '11999999999', // Campo obrigatório no seu schema
    },
  })
  
  console.log(`👤 Usuário criado/encontrado: ${user.name}`)

  // -------------------------------------------------------
  // 2. CRIAR EMPRESA (Company)
  // -------------------------------------------------------
  // Usando cnpj como chave única para o upsert
  const company = await prisma.company.upsert({
    where: { cnpj: '00.000.000/0001-91' },
    update: {},
    create: {
      name: 'Minha Confecção Têxtil',
      cnpj: '00.000.000/0001-91',
      
      // Campos Obrigatórios definidos no Schema
      telefone: '1133334444',
      email: 'contato@confeccao.com',
      endereco: 'Rua da Moda',
      numero: '100',
      bairro: 'Bom Retiro',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01122-000',

      // RELACIONAMENTO (Opção 1: Connect)
      userCreate: {
        connect: { id: user.id }
      }
    },
  })

  console.log(`🏢 Empresa criada/encontrada: ${company.name}`)

  // -------------------------------------------------------
  // 3. CRIAR FORNECEDOR (Supplier) - A CORREÇÃO
  // -------------------------------------------------------
  // Usando 'document' para o where, pois 'email' não é @unique no schema
  await prisma.supplier.upsert({
    where: { document: '11.111.111/0001-11' },
    update: {},
    create: {
      // Dados escalares
      name: 'Tecidos Brasil Ltda',
      email: 'vendas@tecidosbrasil.com',
      document: '11.111.111/0001-11',
      phone: '11988887777',
      address: 'Av. Industrial, 500',
      category: SupplierCategory.MATERIAL_ONLY, // Usando o Enum importado

      // RELACIONAMENTOS (Opção 1: Tudo via connect)
      // Não usamos 'companyId' aqui, usamos o objeto 'company'
      company: {
        connect: { id: company.id }
      },
      
      // Não usamos 'userCreateId' aqui, usamos o objeto 'userCreate'
      userCreate: {
        connect: { id: user.id }
      }
    },
  })

  console.log(`🚚 Fornecedor criado com sucesso!`)
  console.log('✅ Seed finalizado com sucesso, gostosão! 🚀')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })