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
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

const TODAY = new Date();

// Datas para itens concluídos
const COMPLETION_DATES = {
  today: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()),
  yesterday: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1),
  lastWeek: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 7),
  twoWeeksAgo: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 14),
  threeWeeksAgo: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 21),
  lastMonth: new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 15),
  lastYear: new Date(TODAY.getFullYear() - 1, TODAY.getMonth(), 15),
};

// Configuração dos fluxos e suas etapas
const FLOWS_CONFIG = [
  {
    id: "1264c659-3f2a-44cc-b7e5-a369f7d09f96",
    name: "Janeiro 2026",
    stageNames: [
      "Modelagem", "Pilotagem", "Pendentes de Aprovação", "Corte",
      "Distribuição", "Oficina", "Revisão", "Acabamento", "DPA/Expedição"
    ],
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
  {
    id: "19eff5c6-95d3-4cc0-b757-4c29464eb7b6",
    name: "Março 2026",
    stageNames: [
      "Modelagem", "Pilotagem", "Pendentes de Aprovação", "Corte",
      "Distribuição", "Oficina", "Revisão", "Acabamento", "DPA/Expedição"
    ],
    stages: [
      "17a3e42a-e104-48bf-af9c-9ee5260ac9ff",
      "230d6dfd-c830-46c7-b4ef-fa6740c9f7b5",
      "32739804-b0c2-42dc-b7c9-342d10338ca1",
      "3ba70d26-3950-4459-a9bf-513a32919a7b",
      "57e97906-84c9-4475-aebb-c3d9e0a41dc1",
      "b2d95f29-747c-4670-9e54-8544c679b247",
      "b7389062-304d-4331-bc5a-1023cb5790b6",
      "d13dc27d-4260-4aa4-832a-b1cf3fe9c192",
      "eb3eb301-520e-4f8b-ad8f-b5fe6c082f98",
    ],
  },
  {
    id: "b4d84954-f9f6-48df-a5fe-9e82b4321b55",
    name: "Fevereiro 2026",
    stageNames: [
      "Modelagem", "Pilotagem", "Pendentes de Aprovação", "Corte",
      "Distribuição", "Oficina", "Revisão", "Acabamento", "DPA/Expedição"
    ],
    stages: [
      "0a78e52c-c4b8-4916-ba5e-f06c72a87afa",
      "1db2594f-f5ff-44a6-a60c-602acb997cb4",
      "22c473cb-94f7-4885-9ed9-d690302f81bc",
      "64435b3b-9ce0-4572-9b65-fda46d383b6f",
      "73aa0362-dd56-4c1b-82d8-26afaa391fb5",
      "9169f3ae-40ab-466d-af4f-f8746bdf2799",
      "980ce784-2d56-4211-b5fe-c484912135d3",
      "cee3d16a-16b7-439b-a0b4-0f7ddb1dcab4",
      "df4c5dde-9557-4857-bdfe-deb223a3bbb9",
    ],
  },
];

// Lista de usuários para simular diferentes operadores
const USERS = [
  { name: "highadm", email: "highadm@gmail.com", role: "MASTER", professionalRole: "gerente" },
  { name: "Maria Santos", email: "maria.santos@exemplo.com", role: "EMPLOYER", professionalRole: "modelista" },
  { name: "Carlos Oliveira", email: "carlos.oliveira@exemplo.com", role: "EMPLOYER", professionalRole: "piloteira" },
  { name: "Ana Costa", email: "ana.costa@exemplo.com", role: "EMPLOYER", professionalRole: "cortador" },
  { name: "Pedro Alves", email: "pedro.alves@exemplo.com", role: "EMPLOYER", professionalRole: "costureira" },
  { name: "Lucia Ferreira", email: "lucia.ferreira@exemplo.com", role: "EMPLOYER", professionalRole: "acabamento" },
];

const ITEM_TITLES = [
  "Vestido Midi Floral", "Blusa Cropped Algodão", "Calça Pantacourt Linho",
  "Jaqueta Jeans Oversized", "Saia Midi Plissada", "Camisa Social Slim",
  "Bermuda Sarja Cargo", "Macacão Tricot", "Blazer Alfaiataria",
  "Top Corset Couro", "Vestido Longo Estampado",
];

const PRODUCT_REFS = ["REF001", "REF002", "REF003", "REF004", "REF005"];

const MOVEMENT_REASONS = [
  "Etapa concluída com sucesso",
  "Aprovado pelo controle de qualidade",
  "Encaminhado para próxima fase",
  "Liberado para produção",
  "Revisão concluída",
];

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPastDueDate() {
  const daysAgo = Math.random() * 15;
  const dueDate = new Date(TODAY);
  dueDate.setDate(TODAY.getDate() - daysAgo);
  dueDate.setHours(12, 0, 0, 0);
  return dueDate;
}

function randomFutureDueDate() {
  const daysAhead = Math.random() * 30;
  const dueDate = new Date(TODAY);
  dueDate.setDate(TODAY.getDate() + daysAhead);
  dueDate.setHours(12, 0, 0, 0);
  return dueDate;
}

function randomEnteredDate() {
  const daysAgo = 10 + Math.random() * 20;
  const enteredDate = new Date(TODAY);
  enteredDate.setDate(TODAY.getDate() - daysAgo);
  enteredDate.setHours(9, 0, 0, 0);
  return enteredDate;
}

async function createCompletedItem(
  index: number,
  flow: any,
  lastStage: any,
  users: any[],
  completedAt: Date,
  companyId: string
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
      companyId: companyId,
      stageId: lastStage.id,
      orderInStage: index,
      dueDate: new Date(completedAt),
      enteredAt: enteredAt,
      productionStartedAt: productionStartedAt,
      createdAt: enteredAt,
      updatedAt: completedAt,
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
        companyId: companyId,
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
      companyId: companyId,
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
        companyId: companyId,
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
      companyId: companyId,
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

async function createActiveItemWithHistory(
  index: number,
  flowConfig: any,
  users: any[],
  adminUser: any,
  companyId: string,
  isOverdue: boolean
) {
  const stages = flowConfig.stages;
  const stageNames = flowConfig.stageNames;
  
  const dueDate = isOverdue ? randomPastDueDate() : randomFutureDueDate();
  const enteredAt = randomEnteredDate();

  // Determinar progresso: item começa na primeira etapa e avança entre 2 e 5 etapas
  const maxProgress = Math.min(5, stages.length - 1);
  const finalStageIndex = Math.floor(Math.random() * maxProgress) + 1;
  const finalStageId = stages[finalStageIndex];
  const finalStageName = stageNames[finalStageIndex];

  // Gerar movimentações entre etapas
  const movements: any[] = [];
  let currentStageId = stages[0];
  let currentStageName = stageNames[0];

  for (let m = 0; m < finalStageIndex; m++) {
    const nextStageIndex = m + 1;
    const nextStageId = stages[nextStageIndex];
    const nextStageName = stageNames[nextStageIndex];

    const movingUser = users[Math.floor(Math.random() * users.length)];
    const moveDate = randomDate(enteredAt, new Date(Math.min(dueDate.getTime(), TODAY.getTime())));

    movements.push({
      fromStageId: currentStageId,
      fromStageName: currentStageName,
      toStageId: nextStageId,
      toStageName: nextStageName,
      movedBy: movingUser,
      movedAt: moveDate,
      reason: MOVEMENT_REASONS[Math.floor(Math.random() * MOVEMENT_REASONS.length)],
    });

    currentStageId = nextStageId;
    currentStageName = nextStageName;
  }

  // Gerar dados do item
  const title = ITEM_TITLES[Math.floor(Math.random() * ITEM_TITLES.length)];
  const productRef = PRODUCT_REFS[Math.floor(Math.random() * PRODUCT_REFS.length)];
  const quantity = faker.number.int({ min: 1, max: 50 });
  const priority = faker.number.int({ min: 1, max: 5 });
  const responsible = users[Math.floor(Math.random() * users.length)];

  // Criar o item
  const item = await prisma.flowItem.create({
    data: {
      title: `${title} ${Math.floor(Math.random() * 100)}`,
      orderNumber: `#${2026000 + index}`,
      status: isOverdue ? "ATRASADO" : "PENDENTE",
      productRef: productRef,
      quantity: quantity,
      priority: priority,
      flowId: flowConfig.id,
      companyId: companyId,
      stageId: finalStageId,
      orderInStage: index,
      dueDate: dueDate,
      enteredAt: enteredAt,
      createdAt: enteredAt,
      assignedToId: responsible.id,
      description: faker.lorem.sentence(),
    },
  });

  // Registrar etapas no FlowItemStage
  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const stageId = stages[stageIdx];
    const isCurrent = stageIdx === finalStageIndex;
    const isCompleted = stageIdx < finalStageIndex;

    let deadline: Date;
    let actualDeadline: Date | null = null;
    let status = "PENDENTE";

    if (isCurrent) {
      deadline = dueDate;
      status = "ATUAL";
    } else if (isCompleted) {
      const completedMovement = movements.find(m => m.toStageId === stageId);
      if (completedMovement) {
        actualDeadline = completedMovement.movedAt;
        deadline = completedMovement.movedAt;
        status = "CONCLUIDO";
      } else if (stageIdx === 0) {
        actualDeadline = enteredAt;
        deadline = enteredAt;
        status = "CONCLUIDO";
      } else {
        deadline = new Date(enteredAt);
        deadline.setDate(deadline.getDate() + stageIdx);
        actualDeadline = deadline;
        status = "CONCLUIDO";
      }
    } else {
      deadline = new Date(dueDate);
      deadline.setDate(deadline.getDate() + (stageIdx - finalStageIndex));
      status = "PENDENTE";
    }

    await prisma.flowItemStage.create({
      data: {
        itemId: item.id,
        stageId: stageId,
        order: stageIdx,
        deadline: deadline,
        status: status,
        companyId: companyId,
        changedBy: movements.find(m => m.toStageId === stageId)?.movedBy.id || adminUser.id,
        changedAt: actualDeadline || enteredAt,
        suggestedDeadline: deadline,
        actualDeadline: actualDeadline,
      },
    });
  }

  // Registrar log de criação
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: "CREATE_ITEM",
      entity: "FLOW_ITEM",
      entityId: item.id,
      companyId: companyId,
      createdAt: enteredAt,
      newData: {
        title: item.title,
        productRef: item.productRef,
        quantity: item.quantity,
        priority: item.priority,
        dueDate: dueDate,
      },
      metadata: {
        stageName: stageNames[0],
        createdBy: adminUser.name,
      },
    },
  });

  // Registrar cada movimentação
  for (const move of movements) {
    await prisma.auditLog.create({
      data: {
        userId: move.movedBy.id,
        action: "MOVE_ITEM",
        entity: "FLOW_ITEM",
        entityId: item.id,
        companyId: companyId,
        createdAt: move.movedAt,
        oldData: {
          stageId: move.fromStageId,
          stageName: move.fromStageName,
        },
        newData: {
          stageId: move.toStageId,
          stageName: move.toStageName,
        },
        metadata: {
          fromStageId: move.fromStageId,
          fromStageName: move.fromStageName,
          toStageId: move.toStageId,
          toStageName: move.toStageName,
          movedBy: move.movedBy.name,
          movedByRole: move.movedBy.role,
          movedById: move.movedBy.id,
          reason: move.reason,
          timestamp: move.movedAt.toISOString(),
          flowName: flowConfig.name,
        },
      },
    });
  }

  // Registrar update de prioridade (30% dos itens)
  if (Math.random() < 0.3 && movements.length > 0) {
    const updateDate = randomDate(enteredAt, movements[movements.length - 1]?.movedAt || TODAY);
    const updatingUser = users[Math.floor(Math.random() * users.length)];
    const newPriority = faker.number.int({ min: 1, max: 5 });

    await prisma.auditLog.create({
      data: {
        userId: updatingUser.id,
        action: "UPDATE_ITEM",
        entity: "FLOW_ITEM",
        entityId: item.id,
        companyId: companyId,
        createdAt: updateDate,
        oldData: { priority: priority },
        newData: { priority: newPriority },
        metadata: {
          field: "priority",
          oldValue: priority,
          newValue: newPriority,
          changedBy: updatingUser.name,
          reason: "Ajuste de prioridade",
        },
      },
    });

    await prisma.flowItem.update({
      where: { id: item.id },
      data: { priority: newPriority },
    });
  }

  return item;
}

async function main() {
  console.log("🚀 Iniciando seed unificado com itens atrasados, próximos a vencer e histórico...");
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

  // Buscar ou criar usuários
  const createdUsers: any[] = [];
  for (const userData of USERS) {
    let user = await prisma.user.findFirst({
      where: { email: userData.email, companyId: COMPANY_ID },
    });

    if (!user) {
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("senha123", 10);

      user = await prisma.user.create({
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
      console.log(`   ✅ Usuário criado: ${userData.name}`);
    }
    createdUsers.push(user);
  }

  // Buscar admin (highadm)
  const adminUser = createdUsers.find(u => u.email === "highadm@gmail.com") || createdUsers[0];
  console.log(`✅ Admin: ${adminUser.name}`);

  // Buscar fornecedores
  const suppliers = await prisma.supplier.findMany({
    where: { companyId: COMPANY_ID },
  });

  // Limpar dados antigos
  console.log("\n🧹 Limpando dados antigos...");
  const flowIds = FLOWS_CONFIG.map(f => f.id);

  const existingItems = await prisma.flowItem.findMany({
    where: { flowId: { in: flowIds }, companyId: COMPANY_ID },
    select: { id: true },
  });

  if (existingItems.length > 0) {
    const itemIds = existingItems.map(i => i.id);
    await prisma.auditLog.deleteMany({
      where: { entity: "FLOW_ITEM", entityId: { in: itemIds } },
    });
    await prisma.flowItemStage.deleteMany({
      where: { itemId: { in: itemIds } },
    });
    await prisma.flowItem.deleteMany({
      where: { id: { in: itemIds } },
    });
    console.log(`✅ Removidos ${existingItems.length} itens antigos`);
  }

  // =========================================================================
  // PARTE 1: ITENS ATIVOS (ATRASADOS E PRÓXIMOS A VENCER)
  // =========================================================================
  console.log("\n📦 Criando itens ativos com histórico de movimentação...");
  console.log("-".repeat(70));

  const activeItemsCount = 50;
  const activeItems: any[] = [];

  for (let i = 0; i < activeItemsCount; i++) {
    const flowConfig = FLOWS_CONFIG[i % FLOWS_CONFIG.length];
    const isOverdue = i < 30; // 30 itens atrasados, 20 próximos a vencer
    
    const item = await createActiveItemWithHistory(
      i,
      flowConfig,
      createdUsers,
      adminUser,
      COMPANY_ID,
      isOverdue
    );
    activeItems.push(item);
    
    const status = isOverdue ? "🔴 ATRASADO" : "🟢 PRÓXIMO";
    console.log(`[${String(i + 1).padStart(2, '0')}/${activeItemsCount}] ${status} | ${item.title.padEnd(30)} | ${flowConfig.name.padEnd(20)}`);
  }

  // =========================================================================
  // PARTE 2: ITENS CONCLUÍDOS COM HISTÓRICO
  // =========================================================================
  console.log("\n📦 Criando itens concluídos com histórico...");
  console.log("-".repeat(70));

  // Buscar fluxos completos com suas etapas
  const flowsWithStages = await Promise.all(
    FLOWS_CONFIG.map(async (config) => {
      const flow = await prisma.productFlow.findUnique({
        where: { id: config.id, companyId: COMPANY_ID },
        include: { stages: true },
      });
      return { ...config, flow };
    })
  );

  const validFlows = flowsWithStages.filter(f => f.flow !== null);
  if (validFlows.length === 0) {
    throw new Error("❌ Nenhum fluxo encontrado para criar itens concluídos");
  }

  const completedItemsConfigs = [
    { date: COMPLETION_DATES.today, label: "HOJE", count: 5 },
    { date: COMPLETION_DATES.yesterday, label: "ONTEM", count: 5 },
    { date: COMPLETION_DATES.lastWeek, label: "ÚLTIMA SEMANA", count: 5 },
    { date: COMPLETION_DATES.twoWeeksAgo, label: "2 SEMANAS", count: 5 },
    { date: COMPLETION_DATES.threeWeeksAgo, label: "3 SEMANAS", count: 5 },
    { date: COMPLETION_DATES.lastMonth, label: "MÊS PASSADO", count: 5 },
    { date: COMPLETION_DATES.lastYear, label: "ANO PASSADO", count: 5 },
  ];

  let completedItemIndex = 0;
  const allCompletedItems: any[] = [];

  for (const config of completedItemsConfigs) {
    const flowWithStages = validFlows[completedItemIndex % validFlows.length];

    if (flowWithStages.flow && flowWithStages.flow.stages.length > 0) {
      const lastStage = flowWithStages.flow.stages[flowWithStages.flow.stages.length - 1];

      console.log(`\n   📅 Itens concluídos em ${config.label} (${config.date.toLocaleDateString()}):`);

      for (let i = 0; i < config.count; i++) {
        const item = await createCompletedItem(
          completedItemIndex + i,
          flowWithStages.flow,
          lastStage,
          createdUsers,
          config.date,
          COMPANY_ID,
        );
        allCompletedItems.push(item);
        console.log(`      ✅ ${item.title} - concluído em ${item.updatedAt.toLocaleDateString()}`);
      }
    } else {
      console.log(`   ⚠️ Flow "${flowWithStages.name}" not found or has no stages. Skipping creation for ${config.label}.`);
    }
    completedItemIndex += config.count;
  }

  // =========================================================================
  // RESUMO FINAL
  // =========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("✅ SEED UNIFICADO FINALIZADO COM SUCESSO!");
  console.log("=".repeat(70));

  // Estatísticas
  const totalItems = await prisma.flowItem.count({
    where: { companyId: COMPANY_ID, flowId: { in: flowIds } },
  });

  const totalMovements = await prisma.auditLog.count({
    where: {
      entity: "FLOW_ITEM",
      action: "MOVE_ITEM",
      companyId: COMPANY_ID,
    },
  });

  const totalCreates = await prisma.auditLog.count({
    where: {
      entity: "FLOW_ITEM",
      action: "CREATE_ITEM",
      companyId: COMPANY_ID,
    },
  });

  const totalUpdates = await prisma.auditLog.count({
    where: {
      entity: "FLOW_ITEM",
      action: "UPDATE_ITEM",
      companyId: COMPANY_ID,
    },
  });

  const totalCompletions = await prisma.auditLog.count({
    where: {
      entity: "FLOW_ITEM",
      action: "COMPLETE_ITEM",
      companyId: COMPANY_ID,
    },
  });

  console.log(`\n📊 ESTATÍSTICAS GERAIS:`);
  console.log(`   - Total de itens: ${totalItems}`);
  console.log(`   - Itens ativos: ${activeItems.length}`);
  console.log(`   - Itens concluídos: ${allCompletedItems.length}`);
  console.log(`   - Logs de CRIAÇÃO: ${totalCreates}`);
  console.log(`   - Logs de MOVIMENTAÇÃO: ${totalMovements}`);
  console.log(`   - Logs de UPDATE: ${totalUpdates}`);
  console.log(`   - Logs de CONCLUSÃO: ${totalCompletions}`);
  console.log(`   - Média de movimentos por item: ${(totalMovements / totalItems).toFixed(1)}`);

  console.log(`\n📋 DISTRIBUIÇÃO DE ITENS ATIVOS:`);
  console.log(`   🔴 ATRASADOS (prazo vencido): 30 itens`);
  console.log(`   🟢 PRÓXIMOS A VENCER (prazo futuro): 20 itens`);

  console.log(`\n📋 DISTRIBUIÇÃO DE ITENS CONCLUÍDOS:`);
  console.log(`   🟢 Hoje: 5 itens`);
  console.log(`   🟢 Ontem: 5 itens`);
  console.log(`   🟢 Última semana: 5 itens`);
  console.log(`   🟡 2 semanas: 5 itens`);
  console.log(`   🟡 3 semanas: 5 itens`);
  console.log(`   🟠 Mês passado: 5 itens`);
  console.log(`   🔴 Ano passado: 5 itens`);

  console.log("\n✅ Seed concluído! Agora você pode visualizar:");
  console.log("   - Itens atrasados (status ATRASADO)");
  console.log("   - Itens próximos a vencer (status PENDENTE com prazo futuro)");
  console.log("   - Itens concluídos com datas variadas");
  console.log("   - Histórico completo de movimentações para todos os itens");
}

main()
  .catch((e) => {
    console.error("❌ Erro durante o seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });