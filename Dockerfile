# --- BUILDER STAGE ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copia dependências primeiro para aproveitar cache do Docker
COPY package*.json ./
COPY prisma ./prisma/

# Instala tudo (incluindo devDependencies para o build)
RUN npm install

# Copia o código fonte
COPY . .

# Gera o cliente prisma e faz o build
RUN npx prisma generate
RUN npm run build

# --- PRODUCTION STAGE ---
FROM node:22-alpine

WORKDIR /app

# Copia apenas o necessário do estágio anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "run", "start:prod"]