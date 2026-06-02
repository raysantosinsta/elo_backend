
prisma: https://www.linkedin.com/pulse/guia-definitivo-hotfix-de-migrations-prisma-em-produ%C3%A7%C3%A3o-santos-rbkte/?trackingId=yQLnT1LxaOZfymhsw6LaMw%3D%3D

npx prisma migrate diff \
  --from-url "postgresql://postgres.myyysbvhhicrdrmqmgqp:TjxEcRyrxpGmBSNL@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --to-schema-datamodel prisma/schema.prisma \
  --script 

  mkdir prisma/migrations/20260101_rota-realizada

  npx prisma migrate resolve --applied 20260101_rota-realizada

   npx prisma generate

   testar notificao proximosa vencer e itens atrasados

   curl -X POST http://localhost:3000/flow/test-overdue-notification \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0N2U5YjJkMS0xNDg3LTQxMDktODAyMy1jN2Y5M2MyMjNiYzAiLCJlbWFpbCI6Im1vZGFhZHNhZG1pbkBnbWFpbC5jb20iLCJyb2xlIjoiQURNSU4iLCJjb21wYW55SWQiOiJjYzdmMmRhMC00Y2YzLTQ2ZTgtYjZjZi1jMzgxZmFiNmJiODkiLCJpYXQiOjE3Nzk4MTA2NTIsImV4cCI6MTc3OTgxMTU1Mn0.1KLaCplzjDj_6PhxqANT9NB04CWK_tOPpEuSqpWZxeY"

