/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient, UserRole, UserStatus, CompanyStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar uma empresa primeiro
  console.log('🏢 Criando empresa...');
  const company = await prisma.company.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      status: CompanyStatus.ATIVO,
      name: 'Empresa Demo',
      cnpj: '12.345.678/0001-90',
      telefone: '(11) 99999-9999',
      email: 'contato@empresademo.com',
      endereco: 'Rua das Flores',
      numero: '123',
      bairro: 'Centro',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01234-567',
      ramoAtividade: 'Tecnologia',
    },
  });
  console.log(`✅ Empresa criada: ${company.name} (ID: ${company.id})`);

  // Criar usuário MASTER
  console.log('👑 Criando usuário MASTER...');
  const masterPassword = await hashPassword('Blessedhr10@');
  const masterUser = await prisma.user.upsert({
    where: { email: 'santosray62@gmail.com' },
    update: {},
    create: {
      name: 'Ray Santos',
      email: 'santosray62@gmail.com',
      password: masterPassword,
      role: UserRole.MASTER,
      status: UserStatus.ACTIVE,
      phone: '(11) 99999-9999',
      isProfessional: true,
      professionalRole: 'Desenvolvedor Full Stack',
      companyId: company.id,
    },
  });
  console.log(`✅ Usuário MASTER criado: ${masterUser.name} (${masterUser.email})`);

  // Criar usuário ADMIN
  console.log('👤 Criando usuário ADMIN...');
  const adminPassword = await hashPassword('Admin123@');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@empresa.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@empresa.com',
      password: adminPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      phone: '(11) 98888-8888',
      isProfessional: true,
      professionalRole: 'Administrador',
      companyId: company.id,
    },
  });
  console.log(`✅ Usuário ADMIN criado: ${adminUser.name} (${adminUser.email})`);

  // Criar alguns usuários EMPLOYER
  console.log('👥 Criando usuários EMPLOYER...');
  const employerUsers = [
    {
      name: 'João Silva',
      email: 'joao.silva@empresa.com',
      password: 'Employer123@',
      phone: '(11) 97777-7777',
      professionalRole: 'Designer',
    },
    {
      name: 'Maria Santos',
      email: 'maria.santos@empresa.com',
      password: 'Employer123@',
      phone: '(11) 96666-6666',
      professionalRole: 'Gerente de Projetos',
    },
    {
      name: 'Pedro Oliveira',
      email: 'pedro.oliveira@empresa.com',
      password: 'Employer123@',
      phone: '(11) 95555-5555',
      professionalRole: 'Desenvolvedor',
    },
  ];

  for (const userData of employerUsers) {
    const hashedPassword = await hashPassword(userData.password);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: UserRole.EMPLOYER,
        status: UserStatus.ACTIVE,
        phone: userData.phone,
        isProfessional: true,
        professionalRole: userData.professionalRole,
        companyId: company.id,
      },
    });
    console.log(`✅ Usuário EMPLOYER criado: ${user.name} (${user.email})`);
  }

  // Criar colunas Kanban - CORREÇÃO: Sem constraint compound, verificar se já existe
  console.log('📋 Criando colunas Kanban...');
  const kanbanColumns = [
    { title: 'Backlog', description: 'Tarefas a serem planejadas', order: 0 },
    { title: 'A Fazer', description: 'Tarefas a serem realizadas', order: 1 },
    { title: 'Em Progresso', description: 'Tarefas em andamento', order: 2 },
    { title: 'Em Revisão', description: 'Tarefas aguardando revisão', order: 3 },
    { title: 'Concluído', description: 'Tarefas finalizadas', order: 4 },
  ];

  for (const columnData of kanbanColumns) {
    // Verificar se a coluna já existe
    const existingColumn = await prisma.kanbanColumn.findFirst({
      where: {
        companyId: company.id,
        title: columnData.title,
      },
    });

    if (existingColumn) {
      // Atualizar a coluna existente
      await prisma.kanbanColumn.update({
        where: { id: existingColumn.id },
        data: {
          description: columnData.description,
          order: columnData.order,
          updatedById: masterUser.id,
        },
      });
      console.log(`↩️  Coluna Kanban atualizada: ${columnData.title}`);
    } else {
      // Criar nova coluna
      const column = await prisma.kanbanColumn.create({
        data: {
          title: columnData.title,
          description: columnData.description,
          order: columnData.order,
          companyId: company.id,
          createdById: masterUser.id,
        },
      });
      console.log(`✅ Coluna Kanban criada: ${column.title} (Ordem: ${column.order})`);
    }
  }

  // Criar algumas tarefas de exemplo
  console.log('📝 Criando tarefas de exemplo...');
  const columns = await prisma.kanbanColumn.findMany({
    where: { companyId: company.id },
    orderBy: { order: 'asc' },
  });

  const sampleTasks = [
    {
      title: 'Configurar ambiente de desenvolvimento',
      description: 'Instalar todas as dependências e configurar o ambiente',
      column: columns[1], // A Fazer
      assignedTo: adminUser,
    },
    {
      title: 'Desenvolver tela de login',
      description: 'Criar interface de login com validações',
      column: columns[2], // Em Progresso
      assignedTo: masterUser,
    },
    {
      title: 'Revisar código do módulo de usuários',
      description: 'Fazer code review das implementações recentes',
      column: columns[3], // Em Revisão
      assignedTo: adminUser,
    },
    {
      title: 'Deploy da versão 1.0',
      description: 'Realizar deploy da aplicação em produção',
      column: columns[4], // Concluído
      assignedTo: masterUser,
    },
  ];

  for (const taskData of sampleTasks) {
    if (taskData.column) {
      const task = await prisma.task.create({
        data: {
          title: taskData.title,
          description: taskData.description,
          columnId: taskData.column.id,
          assignedToId: taskData.assignedTo.id,
          companyId: company.id,
          createdById: masterUser.id,
          priority: 1,
          scheduledAt: new Date(),
          status: taskData.column.title === 'Concluído' ? 'COMPLETED' : 'PENDING',
        },
      });
      console.log(`✅ Tarefa criada: "${task.title}" (Status: ${task.status})`);
    }
  }

  console.log('🎉 Seed concluído com sucesso!');
  console.log('');
  console.log('📋 RESUMO DA SEED:');
  console.log(`🏢 Empresa: ${company.name} (CNPJ: ${company.cnpj})`);
  console.log(`👑 Usuário MASTER: santosray62@gmail.com / Blessedhr10@`);
  console.log(`👤 Usuário ADMIN: admin@empresa.com / Admin123@`);
  console.log(`👥 Usuários EMPLOYER: 3 usuários criados (todos com senha Employer123@)`);
  console.log(`📋 Kanban: 5 colunas criadas`);
  console.log(`📝 Tarefas: ${sampleTasks.length} tarefas de exemplo criadas`);
  console.log('');
  console.log('🚀 Banco de dados pronto para uso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });