const API_URL = process.env.NEXT_PUBLIC_NESTJS_API_URL || 'http://localhost:3000';

async function testEndpoints() {
  console.log('🧪 Testando endpoints da API...');
  console.log('Base URL:', API_URL);

  const endpoints = [
    '/health',
    '/api/health',
    '/notifications',
    '/tasks',
    '/auth/profile',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`${endpoint}: ${response.status} ${response.statusText}`);
      
      if (response.ok && endpoint !== '/health' && endpoint !== '/api/health') {
        try {
          const data = await response.json();
          console.log(`  Dados:`, Array.isArray(data) ? `Array com ${data.length} itens` : 'Objeto');
        } catch (e) {
          console.log('  Não é JSON ou está vazio');
        }
      }
    } catch (error) {
      console.log(`${endpoint}: ERRO - ${error.message}`);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  testEndpoints();
}

module.exports = { testEndpoints };