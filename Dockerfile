# --- BUILDER STAGE ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copia dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala tudo
RUN npm install

# Copia o código fonte
COPY . .

# Gera o cliente prisma e faz o build
RUN npx prisma generate
RUN npm run build

# 🔍 DIAGNÓSTICO 1: Ver o que foi gerado logo após o build
RUN echo "=== CONTEUDO DA PASTA DIST NO BUILDER ===" && ls -R dist

# --- PRODUCTION STAGE ---
FROM node:22-alpine

WORKDIR /app

# Copia apenas o necessário do estágio anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# 🔍 DIAGNÓSTICO 2: Ver como a pasta dist ficou na imagem final
# Olhe os logs do deploy logo após essa linha aparecer
RUN echo "=== CONTEUDO FINAL DA PASTA DIST ===" && ls -R /app/dist

EXPOSE 3000

CMD ["node", "dist/main.js"]