/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// prisma/seed.ts ou prisma/seed-completed-items.ts

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient } from '@prisma/client';
import { addDays, subDays, subMonths, subYears } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed principal...');

  const company = await prisma.company.findFirst();
  if (!company) {
    throw new Error('Nenhuma empresa encontrada.');
  }

  const flows = await prisma.productFlow.findMany({
    where: { companyId: company.id },
    take: 3,
  });

  if (flows.length === 0) {
    throw new Error('Nenhum fluxo encontrado.');
  }

  const users = await prisma.user.findMany({
    where: { companyId: company.id },
    take: 5,
  });

  if (users.length === 0) {
    throw new Error('Nenhum usuário encontrado.');
  }

  const stages = await prisma.flowStage.findMany({
    where: {
      flowId: { in: flows.map((f) => f.id) },
    },
  });

  console.log('\n🗑️  Limpando itens existentes...');
  await prisma.flowItem.deleteMany({
    where: {
      companyId: company.id,
    },
  });

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const datesConfig = [
    { name: 'today', date: today, count: 15 },
    { name: 'yesterday', date: subDays(today, 1), count: 12 },
    { name: 'twoDaysAgo', date: subDays(today, 2), count: 10 },
    { name: 'threeDaysAgo', date: subDays(today, 3), count: 8 },
    { name: 'fourDaysAgo', date: subDays(today, 4), count: 7 },
    { name: 'fiveDaysAgo', date: subDays(today, 5), count: 6 },
    { name: 'sixDaysAgo', date: subDays(today, 6), count: 5 },
    { name: 'sevenDaysAgo', date: subDays(today, 7), count: 4 },
    { name: 'eightDaysAgo', date: subDays(today, 8), count: 3 },
    { name: 'nineDaysAgo', date: subDays(today, 9), count: 3 },
    { name: 'tenDaysAgo', date: subDays(today, 10), count: 3 },
    { name: 'fifteenDaysAgo', date: subDays(today, 15), count: 2 },
    { name: 'twentyDaysAgo', date: subDays(today, 20), count: 2 },
    { name: 'oneMonthAgo', date: subMonths(today, 1), count: 5 },
    { name: 'twoMonthsAgo', date: subMonths(today, 2), count: 4 },
    { name: 'threeMonthsAgo', date: subMonths(today, 3), count: 3 },
    { name: 'sixMonthsAgo', date: subMonths(today, 6), count: 2 },
    { name: 'oneYearAgo', date: subYears(today, 1), count: 1 },
    { name: 'twoYearsAgo', date: subYears(today, 2), count: 1 },
  ];

  const products = [
    { ref: 'PROD-001', name: 'Camiseta Básica', qty: 100 },
    { ref: 'PROD-002', name: 'Calça Jeans', qty: 50 },
    { ref: 'PROD-003', name: 'Jaqueta Couro', qty: 25 },
    { ref: 'PROD-004', name: 'Vestido Floral', qty: 75 },
    { ref: 'PROD-005', name: 'Blusa Manga Longa', qty: 150 },
    { ref: 'PROD-006', name: 'Short Jeans', qty: 200 },
    { ref: 'PROD-007', name: 'Camisa Social', qty: 80 },
    { ref: 'PROD-008', name: 'Bermuda Cargo', qty: 120 },
    { ref: 'PROD-009', name: 'Moletom', qty: 60 },
    { ref: 'PROD-010', name: 'Regata', qty: 300 },
  ];

  const statuses = ['CONCLUIDO', 'ENTREGUE', 'FINALIZADO'];
  let totalCreated = 0;

  for (const config of datesConfig) {
    for (let i = 0; i < config.count; i++) {
      const flow = flows[Math.floor(Math.random() * flows.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      const product = products[Math.floor(Math.random() * products.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const flowStages = stages.filter((s) => s.flowId === flow.id);
      const stage =
        flowStages.length > 0
          ? flowStages[Math.floor(Math.random() * flowStages.length)]
          : null;

      const deliveryDate = new Date(config.date);
      deliveryDate.setHours(9 + Math.floor(Math.random() * 8));
      deliveryDate.setMinutes(Math.floor(Math.random() * 59));
      deliveryDate.setSeconds(Math.floor(Math.random() * 59));

      const enteredAt = subDays(deliveryDate, Math.floor(Math.random() * 20) + 5);
      enteredAt.setHours(8, 0, 0, 0);

      const productionStartedAt = addDays(enteredAt, Math.floor(Math.random() * 10) + 2);
      productionStartedAt.setHours(8, 30, 0, 0);

      await prisma.flowItem.create({
        data: {
          title: `${product.name} - Lote ${String(i + 1).padStart(3, '0')}`,
          orderNumber: `PED-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`,
          status: status,
          stageId: stage?.id,
          orderInStage: Math.floor(Math.random() * 10),
          productRef: product.ref,
          quantity: product.qty,
          priority: Math.floor(Math.random() * 5) + 1,
          description: `Item concluído em ${deliveryDate.toLocaleDateString('pt-BR')}`,
          flowId: flow.id,
          assignedToId: user.id,
          companyId: company.id,
          enteredAt: enteredAt,
          productionStartedAt: productionStartedAt,
          deliveryAt: deliveryDate,
          dueDate: addDays(enteredAt, Math.floor(Math.random() * 20) + 10),
        },
      });

      totalCreated++;
      console.log(
        `✅ Criado: ${product.name} - Data: ${deliveryDate.toLocaleDateString('pt-BR')} ${deliveryDate.toLocaleTimeString('pt-BR')} (${config.name})`
      );
    }
  }

  const edgeCases = [
    { date: new Date(2024, 1, 15, 10, 30, 0), name: 'Item Fevereiro 2024', ref: 'PROD-EDGE-001' },
    { date: new Date(2024, 5, 20, 14, 15, 0), name: 'Item Junho 2024', ref: 'PROD-EDGE-002' },
    { date: new Date(2024, 11, 25, 9, 45, 0), name: 'Item Dezembro 2024', ref: 'PROD-EDGE-003' },
    { date: new Date(2025, 0, 1, 11, 0, 0), name: 'Item Janeiro 2025', ref: 'PROD-EDGE-004' },
    { date: new Date(2025, 2, 10, 16, 20, 0), name: 'Item Março 2025', ref: 'PROD-EDGE-005' },
    { date: new Date(2025, 5, 15, 13, 45, 0), name: 'Item Junho 2025', ref: 'PROD-EDGE-006' },
    { date: new Date(2025, 8, 20, 10, 0, 0), name: 'Item Setembro 2025', ref: 'PROD-EDGE-007' },
    { date: new Date(2025, 11, 25, 15, 30, 0), name: 'Item Dezembro 2025', ref: 'PROD-EDGE-008' },
  ];

  for (const edgeCase of edgeCases) {
    const flow = flows[Math.floor(Math.random() * flows.length)];
    const user = users[Math.floor(Math.random() * users.length)];

    const enteredAt = subDays(edgeCase.date, 15);
    enteredAt.setHours(8, 0, 0, 0);

    const productionStartedAt = addDays(enteredAt, 7);
    productionStartedAt.setHours(8, 30, 0, 0);

    await prisma.flowItem.create({
      data: {
        title: edgeCase.name,
        orderNumber: `PED-EDGE-${Math.floor(Math.random() * 1000)}`,
        status: 'CONCLUIDO',
        orderInStage: 0,
        productRef: edgeCase.ref,
        quantity: 50,
        priority: 3,
        description: `Item concluído em ${edgeCase.date.toLocaleDateString('pt-BR')}`,
        flowId: flow.id,
        assignedToId: user.id,
        companyId: company.id,
        enteredAt: enteredAt,
        productionStartedAt: productionStartedAt,
        deliveryAt: edgeCase.date,
        dueDate: edgeCase.date,
      },
    });

    totalCreated++;
    console.log(
      `✅ Criado edge: ${edgeCase.name} - Data: ${edgeCase.date.toLocaleDateString('pt-BR')} ${edgeCase.date.toLocaleTimeString('pt-BR')}`
    );
  }

  const verifyDates = await prisma.flowItem.findMany({
    where: { companyId: company.id },
    take: 10,
    orderBy: { deliveryAt: 'desc' },
  });

  console.log('\n📅 VERIFICAÇÃO DAS DATAS CRIADAS:');
  verifyDates.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.title} - ${item.deliveryAt?.toLocaleDateString('pt-BR')} ${item.deliveryAt?.toLocaleTimeString('pt-BR')}`);
  });

  console.log(`\n📊 Total de itens concluídos criados: ${totalCreated}`);
  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });