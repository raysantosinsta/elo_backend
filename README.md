tread subir alterações do schema

npx prisma migrate diff \
  --from-url "postgresql://postgres.myyysbvhhicrdrmqmgqp:TjxEcRyrxpGmBSNL@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --to-schema-datamodel prisma/schema.prisma \
  --script

  mkdir prisma/migrations/20260101_force_add_production_dates

  echo "<COLE_AQUI_O_SQL_GERADO>" > prisma/migrations/20260101_force_add_production_dates/migration.sql

   Aplicar o SQL no banco
   ALTER TABLE itens_fluxo
ADD COLUMN IF NOT EXISTS data_do_inicio_da_producao TIMESTAMP,
ADD COLUMN IF NOT EXISTS data_de_entrega_da_producao TIMESTAMP;

npx prisma migrate resolve --applied 20260101_force_add_production_dates

npm run prisma-deploy

npx prisma generate 


