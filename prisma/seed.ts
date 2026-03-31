/* eslint-disable prettier/prettier */
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
import { FlowItem, PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

// Datas para teste do filtro
const TODAY = new Date();
const DATES = {
  // Datas passadas (para testar períodos)
  lastYear: new Date(2025, 2, 15), // 15/03/2025 - mais de 1 ano
  lastMonth: new Date(2026, 1, 15), // 15/02/2026 - mês passado
  threeWeeksAgo: new Date(2026, 2, 10), // 10/03/2026 - 3 semanas atrás
  twoWeeksAgo: new Date(2026, 2, 17), // 17/03/2026 - 2 semanas atrás
  lastWeek: new Date(2026, 2, 24), // 24/03/2026 - semana passada
  yesterday: new Date(2026, 2, 30), // 30/03/2026 - ontem
  today: new Date(2026, 2, 31, 10, 0, 0), // 31/03/2026 - hoje
};

// Configuração dos fluxos e etapas
const FLOWS_CONFIG = [
  {
    id: "1264c659-3f2a-44cc-b7e5-a369f7d09f96",
    name: "Fluxo Verão 2025",
    stageNames: ["Modelagem", "Pilotagem", "Pendentes de Aprovação", "Corte", "Distribuição", "Oficina", "Revisão", "Acabamento", "DPA/Expedição"],
    stages: [
      "0227e9eb-d896-4ee7-96fd-e6f61ef540b4",
      "45317bf4-fa15-4f64-a847-dcf51b3f3fb1",
      "6fd993f0-ea2f-47ee-a3af-22b6447b5f1a",
      "8bcab4c0-3988-49e7-8212-2d142d441c4c",
      "92aeca7d-7518-4286-9ac8-45df6032e9ce",
      "94dec071-6d7b-439e-82a2-f8640779d208",
      "b0919bf0-e60b-4f5a-a13d-c1f05edfb066",
      "b52191fd-e41b-4b53-87d7-8a7049f6488e",
      "c6cb0398-f542-4842-a096-dff336071176",
    ],
  },
];

// Usuários
const USERS = [
  { name: "João Silva", email: "joao@exemplo.com", role: "EMPLOYER", professionalRole: "modelista" },
  { name: "Maria Santos", email: "maria@exemplo.com", role: "EMPLOYER", professionalRole: "piloteira" },
  { name: "Carlos Oliveira", email: "carlos@exemplo.com", role: "EMPLOYER", professionalRole: "cortador" },
  { name: "Ana Costa", email: "ana@exemplo.com", role: "EMPLOYER", professionalRole: "costureira" },
];

const ITEM_TITLES = [
  "Vestido Midi Floral", "Blusa Cropped Algodão", "Calça Pantacourt Linho",
  "Jaqueta Jeans Oversized", "Saia Midi Plissada", "Camisa Social Slim",
];

const PRODUCT_REFS = ["REF001", "REF002", "REF003", "REF004", "REF005"];

async function main() {
  console.log("🚀 Iniciando seed para testar filtro de data de conclusão...");
  console.log("=".repeat(70));

  const COMPANY_ID = "328f5f08-d8a3-4637-bbcc-a9d56b6f8456";

  // Buscar empresa
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
  });
  if (!company) {
    throw new Error(`❌ Empresa com ID ${COMPANY_ID} não encontrada.`);
  }
  console.log(`✅ Empresa encontrada: ${company.name}`);

  // Buscar usuário admin
  let adminUser = await prisma.user.findFirst({
    where: { email: "highadm@gmail.com", companyId: COMPANY_ID },
  });

  if (!adminUser) {
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash("senha123", 10);
    adminUser = await prisma.user.create({
      data: {
        name: "Administrador",
        email: "highadm@gmail.com",
        contact: "(11) 99999-9999",
        password: hashedPassword,
        role: "MASTER",
        status: "ACTIVE",
        professionalRole: "gerente",
        companyId: COMPANY_ID,
      },
    });
    console.log(`✅ Admin criado: ${adminUser.name}`);
  }

  // Criar usuários adicionais
  const createdUsers = [adminUser];
  for (const userData of USERS) {
    const existingUser = await prisma.user.findFirst({
      where: { email: userData.email, companyId: COMPANY_ID },
    });
    if (!existingUser) {
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("senha123", 10);
      const newUser = await prisma.user.create({
        data: {
          name: userData.name,
          email: userData.email,
          contact: "(11) 9999-9999",
          password: hashedPassword,
          role: userData.role as any,
          status: "ACTIVE",
          professionalRole: userData.professionalRole,
          companyId: COMPANY_ID,
        },
      });
      createdUsers.push(newUser);
      console.log(`   ✅ Usuário criado: ${userData.name}`);
    } else {
      createdUsers.push(existingUser);
    }
  }

  // Buscar fluxo
  const flowConfig = FLOWS_CONFIG[0];
  const flow = await prisma.productFlow.findUnique({
    where: { id: flowConfig.id, companyId: COMPANY_ID },
    include: { stages: true },
  });

  if (!flow) {
    throw new Error(`❌ Fluxo ${flowConfig.name} não encontrado.`);
  }
  console.log(`✅ Fluxo encontrado: ${flow.name}`);

  // Última etapa (onde os itens são concluídos)
  const lastStage = flow.stages[flow.stages.length - 1];
  console.log(`📌 Última etapa: ${lastStage.name}`);

  // Limpar dados antigos
  console.log("\n🧹 Limpando dados antigos...");
  await prisma.auditLog.deleteMany({
    where: { entity: "FLOW_ITEM", companyId: COMPANY_ID },
  });
  await prisma.flowItemStage.deleteMany({
    where: { companyId: COMPANY_ID },
  });
  await prisma.flowItem.deleteMany({
    where: { companyId: COMPANY_ID, flowId: flow.id },
  });
  console.log("✅ Dados antigos removidos");

  // =========================================================================
  // CRIAR ITENS COM DATAS DE CONCLUSÃO ESPECÍFICAS
  // =========================================================================
  const itemsToCreate: FlowItem[] = [];

  // 1. Itens concluídos hoje (31/03/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos HOJE (31/03/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i,
      flow,
      lastStage,
      createdUsers,
      DATES.today
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 1}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 2. Itens concluídos ontem (30/03/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos ONTEM (30/03/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 5,
      flow,
      lastStage,
      createdUsers,
      DATES.yesterday
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 6}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 3. Itens concluídos na última semana (24/03/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos na ÚLTIMA SEMANA (24/03/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 10,
      flow,
      lastStage,
      createdUsers,
      DATES.lastWeek
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 11}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 4. Itens concluídos há 2 semanas (17/03/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos há 2 SEMANAS (17/03/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 15,
      flow,
      lastStage,
      createdUsers,
      DATES.twoWeeksAgo
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 16}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 5. Itens concluídos há 3 semanas (10/03/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos há 3 SEMANAS (10/03/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 20,
      flow,
      lastStage,
      createdUsers,
      DATES.threeWeeksAgo
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 21}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 6. Itens concluídos no mês passado (15/02/2026) - 5 itens
  console.log("\n📦 Criando itens concluídos no MÊS PASSADO (15/02/2026)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 25,
      flow,
      lastStage,
      createdUsers,
      DATES.lastMonth
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 26}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // 7. Itens concluídos no ano passado (15/03/2025) - 5 itens
  console.log("\n📦 Criando itens concluídos no ANO PASSADO (15/03/2025)...");
  for (let i = 0; i < 5; i++) {
    const item = await createCompletedItem(
      i + 30,
      flow,
      lastStage,
      createdUsers,
      DATES.lastYear
    );
    itemsToCreate.push(item);
    console.log(`   ✅ Item ${i + 31}: ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
  }

  // =========================================================================
  // RESUMO
  // =========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("✅ SEED FINALIZADO COM SUCESSO!");
  console.log("=".repeat(70));

  console.log("\n📊 RESUMO DE ITENS CONCLUÍDOS:");
  console.log(`   🟢 Hoje (31/03/2026): 5 itens`);
  console.log(`   🟢 Ontem (30/03/2026): 5 itens`);
  console.log(`   🟢 Última semana (24/03/2026): 5 itens`);
  console.log(`   🟡 2 semanas atrás (17/03/2026): 5 itens`);
  console.log(`   🟡 3 semanas atrás (10/03/2026): 5 itens`);
  console.log(`   🟠 Mês passado (15/02/2026): 5 itens`);
  console.log(`   🔴 Ano passado (15/03/2025): 5 itens`);
  console.log(`   📦 Total: ${itemsToCreate.length} itens concluídos`);

  console.log("\n📋 TESTE OS FILTROS:");
  console.log("   - Período: Hoje → deve mostrar 5 itens");
  console.log("   - Período: Últimos 7 dias → deve mostrar 10 itens (hoje + ontem + última semana)");
  console.log("   - Período: Último mês → deve mostrar 20 itens (todas as datas de março)");
  console.log("   - Período: Último ano → deve mostrar 35 itens (todos exceto ano passado)");
  console.log("   - Datas customizadas: 01/03/2026 a 31/03/2026 → deve mostrar 20 itens");
}

async function createCompletedItem(
  index: number,
  flow: any,
  lastStage: any,
  users: any[],
  completedAt: Date
) {
  const title = ITEM_TITLES[index % ITEM_TITLES.length];
  const productRef = PRODUCT_REFS[index % PRODUCT_REFS.length];
  const quantity = faker.number.int({ min: 5, max: 50 });
  const priority = faker.number.int({ min: 1, max: 5 });
  const assignedUser = users[Math.floor(Math.random() * users.length)];

  // Data de entrada (alguns dias antes da conclusão)
  const enteredAt = new Date(completedAt);
  enteredAt.setDate(enteredAt.getDate() - faker.number.int({ min: 5, max: 20 }));

  // Data de início da produção (alguns dias após entrada)
  const productionStartedAt = new Date(enteredAt);
  productionStartedAt.setDate(productionStartedAt.getDate() + faker.number.int({ min: 1, max: 3 }));

  // Criar o item já como CONCLUIDO
  const item = await prisma.flowItem.create({
    data: {
      title: `${title} ${index + 1}`,
      orderNumber: `#${2026000 + index}`,
      status: "CONCLUIDO",
      productRef: productRef,
      quantity: quantity,
      priority: priority,
      flowId: flow.id,
      companyId: flow.companyId,
      stageId: lastStage.id,
      orderInStage: index,
      dueDate: new Date(completedAt),
      enteredAt: enteredAt,
      productionStartedAt: productionStartedAt,
      createdAt: enteredAt,
      updatedAt: completedAt, // 🔥 Data de conclusão
      assignedToId: assignedUser.id,
      description: faker.lorem.sentence(),
    },
  });

  // Registrar todas as etapas que o item passou
  const stages = flow.stages;
  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const stage = stages[stageIdx];
    const isLastStage = stage.id === lastStage.id;
    
    let deadline: Date;
    let status: string;
    let actualDeadline: Date | null = null;

    if (isLastStage) {
      deadline = completedAt;
      status = "CONCLUIDO";
      actualDeadline = completedAt;
    } else {
      // Etapas anteriores - concluídas antes
      deadline = new Date(completedAt);
      deadline.setDate(deadline.getDate() - (stages.length - stageIdx));
      status = "CONCLUIDO";
      actualDeadline = deadline;
    }

    await prisma.flowItemStage.create({
      data: {
        itemId: item.id,
        stageId: stage.id,
        order: stage.order,
        deadline: deadline,
        status: status,
        companyId: flow.companyId,
        changedBy: assignedUser.id,
        changedAt: actualDeadline || completedAt,
        suggestedDeadline: deadline,
        actualDeadline: actualDeadline,
      },
    });
  }

  // Registrar log de criação
  await prisma.auditLog.create({
    data: {
      userId: assignedUser.id,
      action: "CREATE_ITEM",
      entity: "FLOW_ITEM",
      entityId: item.id,
      companyId: flow.companyId,
      createdAt: enteredAt,
      newData: { title: item.title, productRef: item.productRef, quantity: item.quantity },
      metadata: { createdBy: assignedUser.name, stageName: lastStage.name },
    },
  });

  // Registrar movimentações até a conclusão
  for (let stageIdx = 1; stageIdx < stages.length; stageIdx++) {
    const fromStage = stages[stageIdx - 1];
    const toStage = stages[stageIdx];
    const moveDate = new Date(completedAt);
    moveDate.setDate(moveDate.getDate() - (stages.length - stageIdx));

    await prisma.auditLog.create({
      data: {
        userId: assignedUser.id,
        action: "MOVE_ITEM",
        entity: "FLOW_ITEM",
        entityId: item.id,
        companyId: flow.companyId,
        createdAt: moveDate,
        oldData: { stageId: fromStage.id, stageName: fromStage.name },
        newData: { stageId: toStage.id, stageName: toStage.name },
        metadata: {
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          movedBy: assignedUser.name,
          reason: "Etapa concluída",
        },
      },
    });
  }

  // Registrar log de conclusão
  await prisma.auditLog.create({
    data: {
      userId: assignedUser.id,
      action: "COMPLETE_ITEM",
      entity: "FLOW_ITEM",
      entityId: item.id,
      companyId: flow.companyId,
      createdAt: completedAt,
      metadata: {
        fromStageName: lastStage.name,
        status: "CONCLUIDO",
        completedAt: completedAt.toISOString(),
      },
    },
  });

  return item;
}

main()
  .catch((e) => {
    console.error("❌ Erro durante o seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });