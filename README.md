
prisma: https://www.linkedin.com/pulse/guia-definitivo-hotfix-de-migrations-prisma-em-produ%C3%A7%C3%A3o-santos-rbkte/?trackingId=yQLnT1LxaOZfymhsw6LaMw%3D%3D

npx prisma migrate diff \
  --from-url "postgresql://postgres.myyysbvhhicrdrmqmgqp:TjxEcRyrxpGmBSNL@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --to-schema-datamodel prisma/schema.prisma \
  --script 

  mkdir prisma/migrations/20260101_auditoria

  npx prisma migrate resolve --applied 20260101_auditoria


   npx prisma generate

   
   [Documento sem título (8).pdf](https://github.com/user-attachments/files/26282779/Documento.sem.titulo.8.pdf)
