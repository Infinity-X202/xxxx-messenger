-- CreateTable
CREATE TABLE IF NOT EXISTS "device_files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "folder_path" TEXT NOT NULL DEFAULT '/',
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "device_files_storage_key_key" ON "device_files"("storage_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "device_files_user_id_created_at_idx" ON "device_files"("user_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_files_user_id_fkey'
  ) THEN
    ALTER TABLE "device_files" ADD CONSTRAINT "device_files_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
