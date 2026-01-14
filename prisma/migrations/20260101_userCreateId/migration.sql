ALTER TABLE "usuarios" ADD COLUMN     "user_create_id" UUID,
ADD COLUMN     "user_update_id" UUID;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;