/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaClient, SupplierCategory, SimpleStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de Fornecedores com Geolocalização...');

  // 1. Buscar dependências obrigatórias (Empresa e Usuário)
  // O sistema precisa saber a quem esses fornecedores pertencem.
  const company = await prisma.company.findFirst();
  
  // Busca um usuário que pertença a essa empresa para ser o "criador"
  const user = await prisma.user.findFirst({
    where: { companyId: company?.id } 
  });

  if (!company || !user) {
    console.error('❌ ERRO: Cadastre pelo menos uma Empresa e um Usuário antes de rodar este seed.');
    return;
  }

  console.log(`🏢 Vinculando à empresa: ${company.name}`);
  console.log(`👤 Usuário criador: ${user.name}`);

  // 2. Dados dos Fornecedores (Com Lat/Long reais de polos de moda)
  const suppliers = [
    {
      name: 'Tecidos Premium Brás',
      document: '12.345.678/0001-90',
      email: 'vendas@tecidospremium.com.br',
      phone: '11999887766',
      category: SupplierCategory.MATERIAL_ONLY,
      
      // Endereço (Brás - SP)
      address: 'Rua Mendes Júnior',
      numero: '450',
      bairro: 'Brás',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '03013-000',
      complement: 'Galpão 3',
      
      // Coordenadas
      latitude: -23.535640,
      longitude: -46.614210,
      
      status: SimpleStatus.ACTIVE,
    },
    {
      name: 'Facção Dona Maria (Bom Retiro)',
      document: '98.765.432/0001-10',
      email: 'maria.costura@email.com',
      phone: '11988776655',
      category: SupplierCategory.SERVICE_ONLY,
      
      // Endereço (Bom Retiro - SP)
      address: 'Rua da Graça',
      numero: '120',
      bairro: 'Bom Retiro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01125-001',
      complement: 'Sala 12',
      
      // Coordenadas
      latitude: -23.528950,
      longitude: -46.638920,
      
      status: SimpleStatus.ACTIVE,
    },
    {
      name: 'Aviamentos Santa Catarina',
      document: '45.678.901/0001-23',
      email: 'vendas@aviamentossc.com.br',
      phone: '4733445566',
      category: SupplierCategory.HYBRID,
      
      // Endereço (Itajaí - SC)
      address: 'Rua Brusque',
      numero: '890',
      bairro: 'Centro',
      city: 'Itajaí',
      state: 'SC',
      zipCode: '88303-000',
      complement: null,
      
      // Coordenadas
      latitude: -26.908310,
      longitude: -48.663150,
      
      status: SimpleStatus.ACTIVE,
    },
    {
      name: 'Estamparia Digital Rio',
      document: '11.222.333/0001-44',
      email: 'arte@digitalrio.com.br',
      phone: '2199887744',
      category: SupplierCategory.SERVICE_ONLY,
      
      // Endereço (Centro - RJ)
      address: 'Rua do Ouvidor',
      numero: '50',
      bairro: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20040-030',
      complement: 'Loja A',
      
      // Coordenadas
      latitude: -22.902670,
      longitude: -43.177650,
      
      status: SimpleStatus.ACTIVE,
    }
  ];

  // 3. Inserção no Banco
  for (const sup of suppliers) {
    await prisma.supplier.upsert({
      where: { document: sup.document }, // Usa o CNPJ para evitar duplicidade
      update: {
        // Atualiza campos novos caso o registro já exista
        numero: sup.numero,
        bairro: sup.bairro,
        latitude: sup.latitude,
        longitude: sup.longitude,
        address: sup.address // Garante que o endereço esteja limpo (sem número concatenado)
      },
      create: {
        name: sup.name,
        document: sup.document,
        email: sup.email,
        phone: sup.phone,
        category: sup.category,
        
        // Dados de Endereço Completos
        address: sup.address,
        numero: sup.numero,
        bairro: sup.bairro,
        city: sup.city,
        state: sup.state,
        zipCode: sup.zipCode,
        complement: sup.complement,
        
        // Geolocalização
        latitude: sup.latitude,
        longitude: sup.longitude,
        
        status: sup.status,
        
        // Relacionamentos
        company: { connect: { id: company.id } },
        userCreate: { connect: { id: user.id } },
      },
    });
  }

  console.log(`✅ Seed finalizado com sucesso! ${suppliers.length} fornecedores processados.`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });