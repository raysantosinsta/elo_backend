/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// prisma/seed.ts ou prisma/seed-completed-items.ts

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// prisma/seed.ts
// prisma/seed.ts
// prisma/seed.ts
import { PrismaClient, TaskStatus, RouteStatus, UserRole, SimpleStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ID da empresa existente
const EMPRESA_ID = "328f5f08-d8a3-4637-bbcc-a9d56b6f8456";

// Endereços de exemplo (10 endereços reais)
const enderecos = [
  {
    cep: "01001000",
    endereco: "Praça da Sé",
    numero: "100",
    bairro: "Sé",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "Centro",
    latitude: -23.5505,
    longitude: -46.6333,
  },
  {
    cep: "01311000",
    endereco: "Avenida Paulista",
    numero: "1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5654,
    longitude: -46.6516,
  },
  {
    cep: "04538082",
    endereco: "Avenida Brigadeiro Faria Lima",
    numero: "2000",
    bairro: "Pinheiros",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5744,
    longitude: -46.6938,
  },
  {
    cep: "05425020",
    endereco: "Avenida Rebouças",
    numero: "3000",
    bairro: "Pinheiros",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5627,
    longitude: -46.6845,
  },
  {
    cep: "04094000",
    endereco: "Avenida Ibirapuera",
    numero: "2500",
    bairro: "Indianópolis",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5875,
    longitude: -46.6584,
  },
  {
    cep: "01414001",
    endereco: "Rua Augusta",
    numero: "1500",
    bairro: "Cerqueira César",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5592,
    longitude: -46.6635,
  },
  {
    cep: "04709001",
    endereco: "Avenida Santo Amaro",
    numero: "5000",
    bairro: "Santo Amaro",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.6481,
    longitude: -46.7083,
  },
  {
    cep: "05010000",
    endereco: "Rua Turiaçu",
    numero: "800",
    bairro: "Perdizes",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5364,
    longitude: -46.6787,
  },
  {
    cep: "04116000",
    endereco: "Rua Vergueiro",
    numero: "2000",
    bairro: "Vila Mariana",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.5741,
    longitude: -46.6346,
  },
  {
    cep: "05653000",
    endereco: "Avenida Giovanni Gronchi",
    numero: "3000",
    bairro: "Vila Andrade",
    cidade: "São Paulo",
    estado: "SP",
    complemento: "",
    latitude: -23.6215,
    longitude: -46.7301,
  },
];

// Títulos das tarefas
const titulosTarefas = [
  "Entrega de materiais - Loja Alphaville",
  "Coleta de peças - Centro",
  "Instalação de equipamentos - Zona Sul",
  "Manutenção preventiva - Zona Norte",
  "Vistoria técnica - Zona Leste",
  "Entrega de documentos - Consolação",
  "Retirada de amostras - Moema",
  "Assistência técnica - Itaim Bibi",
  "Montagem de estrutura - Pinheiros",
  "Limpeza especializada - Vila Olímpia",
];

// Descrições das tarefas
const descricoesTarefas = [
  "Entregar materiais de construção conforme nota fiscal",
  "Coletar peças para reparo na oficina central",
  "Instalar novos equipamentos de segurança",
  "Realizar manutenção preventiva nos sistemas",
  "Fazer vistoria técnica para liberação do espaço",
  "Entregar documentos contratuais assinados",
  "Coletar amostras para análise em laboratório",
  "Realizar assistência técnica emergencial",
  "Montar estrutura para evento corporativo",
  "Realizar limpeza especializada pós-obra",
];

async function main() {
  console.log("🚀 Iniciando seed de tarefas e rotas...");
  console.log(`🏢 Empresa ID: ${EMPRESA_ID}`);

  // 1. Verificar se a empresa existe
  const empresa = await prisma.company.findUnique({
    where: { id: EMPRESA_ID },
  });

  if (!empresa) {
    console.error(`❌ Empresa com ID ${EMPRESA_ID} não encontrada!`);
    console.log("📝 Por favor, verifique se o ID está correto ou crie a empresa primeiro.");
    process.exit(1);
  }
  
  console.log(`✅ Empresa encontrada: ${empresa.name}`);

  // 2. Buscar um usuário da empresa (qualquer um que possa criar tarefas)
  let usuario = await prisma.user.findFirst({
    where: { 
      companyId: EMPRESA_ID,
      status: SimpleStatus.ACTIVE,
    },
  });

  if (!usuario) {
    console.log("👤 Criando usuário administrador para a empresa...");
    usuario = await prisma.user.create({
      data: {
        name: "Administrador",
        email: "admin@empresa.com",
        contact: "(11) 99999-9999",
        password: "$2a$10$encrypted_password_here", // Substitua por senha criptografada real
        role: UserRole.MASTER,
        status: SimpleStatus.ACTIVE,
        companyId: EMPRESA_ID,
      },
    });
    console.log(`✅ Usuário criado: ${usuario.name} (ID: ${usuario.id})`);
  }

  // 3. Buscar ou criar coluna Kanban para a empresa
  let colunaKanban = await prisma.kanbanColumn.findFirst({
    where: { companyId: EMPRESA_ID },
  });

  if (!colunaKanban) {
    console.log("📋 Criando coluna Kanban...");
    colunaKanban = await prisma.kanbanColumn.create({
      data: {
        title: "Tarefas",
        description: "Coluna padrão para tarefas",
        order: 0,
        companyId: EMPRESA_ID,
        userCreateId: usuario.id,
        userUpdateId: usuario.id,
      },
    });
    console.log(`✅ Coluna Kanban criada: ${colunaKanban.title} (ID: ${colunaKanban.id})`);
  }

  // 4. Limpar dados existentes (opcional - cuidado!)
  console.log("\n🗑️ Removendo dados existentes da empresa...");
  
  // Remover tasks existentes
  const tasksExistentes = await prisma.task.findMany({
    where: { companyId: EMPRESA_ID },
    select: { id: true }
  });
  
  if (tasksExistentes.length > 0) {
    // Primeiro remover os endereços
    for (const task of tasksExistentes) {
      await prisma.taskAddress.deleteMany({
        where: { taskId: task.id }
      });
    }
    // Depois remover as tasks
    await prisma.task.deleteMany({
      where: { companyId: EMPRESA_ID }
    });
    console.log(`  ✅ Removidas ${tasksExistentes.length} tarefas existentes`);
  }
  
  // Remover rotas existentes
  const rotasExistentes = await prisma.route.deleteMany({
    where: { companyId: EMPRESA_ID }
  });
  console.log(`  ✅ Removidas ${rotasExistentes.count} rotas existentes`);

  // 5. Criar 10 tarefas com endereços
  console.log("\n📝 Criando 10 tarefas com endereços...");
  const tarefas: any[] = [];

  for (let i = 0; i < 10; i++) {
    const endereco = enderecos[i];
    const dataAgendamento = new Date();
    dataAgendamento.setDate(dataAgendamento.getDate() + i);
    
    const dataPrazo = new Date();
    dataPrazo.setDate(dataPrazo.getDate() + i + 3);

    // Criar a tarefa
    const tarefa = await prisma.task.create({
      data: {
        title: titulosTarefas[i],
        description: descricoesTarefas[i],
        status: TaskStatus.PENDING,
        priority: Math.floor(Math.random() * 5) + 1, // Prioridade de 1 a 5
        columnOrder: i, // ordem dentro da coluna
        scheduledDate: dataAgendamento,
        dueDate: dataPrazo,
        columnId: colunaKanban.id,
        companyId: EMPRESA_ID,
        userCreateId: usuario.id,
        userUpdateId: usuario.id,
        // Associa a um usuário (opcional)
        userAssignedId: usuario.id,
        // Criar endereço associado
        taskAddress: {
          create: {
            cep: endereco.cep,
            endereco: endereco.endereco,
            numero: endereco.numero,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            estado: endereco.estado,
            complemento: endereco.complemento,
            latitude: endereco.latitude,
            longitude: endereco.longitude,
            companyId: EMPRESA_ID,
          },
        },
      },
      include: {
        taskAddress: true,
      },
    });

    tarefas.push(tarefa);
    console.log(`  ✅ Tarefa ${i + 1}: ${tarefa.title}`);
    console.log(`     Endereço: ${endereco.endereco}, ${endereco.numero} - ${endereco.cidade}`);
  }

  // 6. Criar 10 rotas com as tarefas
  console.log("\n🗺️ Criando 10 rotas com as tarefas...");
  
  // Rota 1: Tarefas 1-3
  const rota1 = await prisma.route.create({
    data: {
      title: "Rota Zona Central - Entregas Matinais",
      description: "Entregas na região central de São Paulo",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "DISTANCE",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: tarefas.slice(0, 3).map(t => ({ id: t.id })),
      },
    },
  });
  console.log(`  ✅ Rota 1: ${rota1.title} (${tarefas.slice(0, 3).length} tarefas)`);

  // Rota 2: Tarefas 4-6
  const rota2 = await prisma.route.create({
    data: {
      title: "Rota Zona Sul - Coletas e Entregas",
      description: "Coletas e entregas na zona sul",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "PRIORITY",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: tarefas.slice(3, 6).map(t => ({ id: t.id })),
      },
    },
  });
  console.log(`  ✅ Rota 2: ${rota2.title} (${tarefas.slice(3, 6).length} tarefas)`);

  // Rota 3: Tarefas 7-9
  const rota3 = await prisma.route.create({
    data: {
      title: "Rota Zona Norte - Manutenções",
      description: "Serviços de manutenção na zona norte",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "DISTANCE",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: tarefas.slice(6, 9).map(t => ({ id: t.id })),
      },
    },
  });
  console.log(`  ✅ Rota 3: ${rota3.title} (${tarefas.slice(6, 9).length} tarefas)`);

  // Rota 4: Tarefa 10 + tarefa 1
  const rota4 = await prisma.route.create({
    data: {
      title: "Rota Expressa - Entregas Urgentes",
      description: "Entregas com alta prioridade",
      status: RouteStatus.IN_PROGRESS,
      routeDate: new Date(),
      orderBy: "PRIORITY",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: [
          { id: tarefas[9].id }, // Tarefa 10
          { id: tarefas[0].id }, // Tarefa 1
        ],
      },
    },
  });
  console.log(`  ✅ Rota 4: ${rota4.title} (2 tarefas)`);

  // Rota 5: Tarefas 2, 4, 6, 8
  const rota5 = await prisma.route.create({
    data: {
      title: "Rota Alternativa - Serviços Especiais",
      description: "Serviços especiais em diferentes regiões",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "DISTANCE",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: [
          { id: tarefas[1].id }, // Tarefa 2
          { id: tarefas[3].id }, // Tarefa 4
          { id: tarefas[5].id }, // Tarefa 6
          { id: tarefas[7].id }, // Tarefa 8
        ],
      },
    },
  });
  console.log(`  ✅ Rota 5: ${rota5.title} (4 tarefas)`);

  // Rota 6: Tarefas 3, 5, 7, 9
  const rota6 = await prisma.route.create({
    data: {
      title: "Rota Integrada - Visitas Técnicas",
      description: "Visitas técnicas programadas",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "PRIORITY",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: [
          { id: tarefas[2].id }, // Tarefa 3
          { id: tarefas[4].id }, // Tarefa 5
          { id: tarefas[6].id }, // Tarefa 7
          { id: tarefas[8].id }, // Tarefa 9
        ],
      },
    },
  });
  console.log(`  ✅ Rota 6: ${rota6.title} (4 tarefas)`);

  // Rota 7: Tarefas 1, 3, 5, 7, 9
  const rota7 = await prisma.route.create({
    data: {
      title: "Rota Prioritária - Clientes VIP",
      description: "Atendimento a clientes prioritários",
      status: RouteStatus.FINISHED,
      routeDate: new Date(),
      orderBy: "DISTANCE",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: [
          { id: tarefas[0].id },
          { id: tarefas[2].id },
          { id: tarefas[4].id },
          { id: tarefas[6].id },
          { id: tarefas[8].id },
        ],
      },
    },
  });
  console.log(`  ✅ Rota 7: ${rota7.title} (5 tarefas)`);

  // Rota 8: Tarefas 2, 4, 6, 8, 10
  const rota8 = await prisma.route.create({
    data: {
      title: "Rota Empresarial - Parceiros Comerciais",
      description: "Visitas a parceiros comerciais",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "PRIORITY",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: [
          { id: tarefas[1].id },
          { id: tarefas[3].id },
          { id: tarefas[5].id },
          { id: tarefas[7].id },
          { id: tarefas[9].id },
        ],
      },
    },
  });
  console.log(`  ✅ Rota 8: ${rota8.title} (5 tarefas)`);

  // Rota 9: Todas as tarefas
  const rota9 = await prisma.route.create({
    data: {
      title: "Rota Completa - Full Service",
      description: "Rota completa com todas as tarefas",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "DISTANCE",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: tarefas.map(t => ({ id: t.id })),
      },
    },
  });
  console.log(`  ✅ Rota 9: ${rota9.title} (${tarefas.length} tarefas)`);

  // Rota 10: Tarefas 5-10
  const rota10 = await prisma.route.create({
    data: {
      title: "Rota Especial - Final de Semana",
      description: "Entregas programadas para final de semana",
      status: RouteStatus.SCHEDULED,
      routeDate: new Date(),
      orderBy: "PRIORITY",
      companyId: EMPRESA_ID,
      userCreateId: usuario.id,
      userUpdateId: usuario.id,
      userAssignedId: usuario.id,
      tasks: {
        connect: tarefas.slice(4, 10).map(t => ({ id: t.id })),
      },
    },
  });
  console.log(`  ✅ Rota 10: ${rota10.title} (${tarefas.slice(4, 10).length} tarefas)`);

  // 7. Resumo final
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMO DA EXECUÇÃO:");
  console.log("=".repeat(60));
  console.log(`🏢 Empresa: ${empresa.name} (${EMPRESA_ID})`);
  console.log(`👤 Usuário responsável: ${usuario.name}`);
  console.log(`✅ ${tarefas.length} tarefas criadas com endereços`);
  console.log(`✅ 10 rotas criadas com distribuição variada de tarefas`);
  console.log("\n📋 Detalhes das tarefas:");
  tarefas.forEach((tarefa, idx) => {
    console.log(`  ${idx + 1}. ${tarefa.title}`);
    console.log(`     📍 ${tarefa.taskAddress?.endereco}, ${tarefa.taskAddress?.numero} - ${tarefa.taskAddress?.cidade}`);
  });
  console.log("\n🗺️ Rotas criadas:");
  console.log(`  1. Rota Zona Central - 3 tarefas`);
  console.log(`  2. Rota Zona Sul - 3 tarefas`);
  console.log(`  3. Rota Zona Norte - 3 tarefas`);
  console.log(`  4. Rota Expressa - 2 tarefas`);
  console.log(`  5. Rota Alternativa - 4 tarefas`);
  console.log(`  6. Rota Integrada - 4 tarefas`);
  console.log(`  7. Rota Prioritária - 5 tarefas`);
  console.log(`  8. Rota Empresarial - 5 tarefas`);
  console.log(`  9. Rota Completa - 10 tarefas`);
  console.log(`  10. Rota Especial - 6 tarefas`);
  console.log("=".repeat(60));
  console.log("🎉 Seed concluído com sucesso!");
  console.log("\n💡 Agora você pode visualizar as tarefas e rotas na empresa:");
  console.log(`   🔗 Tasks: /tasks?companyId=${EMPRESA_ID}`);
  console.log(`   🗺️ Routes: /routes?companyId=${EMPRESA_ID}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro durante o seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });