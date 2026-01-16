FROM node:22-alpine

WORKDIR /app

# 1. Instalar dependências
COPY package*.json ./
# O --omit=dev deixaria a imagem menor, mas como o Nest precisa de devDependencies para o build, usamos install normal
RUN npm install

# 2. Gerar o cliente Prisma (Crucial)
COPY prisma ./prisma
RUN npx prisma generate

# 3. Copiar o código fonte
COPY . .

# 4. Construir o projeto (Cria a pasta dist)
RUN npm run build

# 5. EXPOR A PORTA (Documentação apenas, o Render injeta a porta)
EXPOSE 3000

# 6. COMANDO DE INICIALIZAÇÃO (O que faltava!)
# Usa o script start:prod do seu package.json que roda "node dist/main"
CMD ["npm", "run", "start:prod"]