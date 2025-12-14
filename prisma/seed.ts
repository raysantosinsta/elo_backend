/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaClient, UserRole, UserStatus, SimpleStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Criar a empresa
  console.log('🏢 Criando empresa...');
  const company = await prisma.company.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      status: SimpleStatus.ACTIVE,
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

  // 2. Criar usuário MASTER
  console.log('👑 Criando usuário MASTER...');
  const masterPassword = await hashPassword('Blessedhr10@');
  
  const masterUser = await prisma.user.upsert({
    where: { email: 'santosray62@gmail.com' },
    update: {}, // Não faz nada se já existir
    create: {
      name: 'Ray Santos',
      email: 'santosray62@gmail.com',
      password: masterPassword,
      role: UserRole.MASTER,
      status: UserStatus.ACTIVE,
      contact: '(11) 99999-9999',
      professionalRole: 'Desenvolvedor Full Stack',
      companyId: company.id, // Vincula à empresa criada acima
    },
  });
  console.log(`✅ Usuário MASTER criado: ${masterUser.name} (${masterUser.email})`);

  console.log('🎉 Seed concluído com sucesso!');
  console.log('');
  console.log('📋 RESUMO DA SEED:');
  console.log(`🏢 Empresa: ${company.name} (CNPJ: ${company.cnpj})`);
  console.log(`👑 Usuário MASTER: santosray62@gmail.com / Blessedhr10@`);
  console.log('');
  console.log('🚀 Banco de dados pronto para uso (Mínimo Viável)!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });