CREATE TABLE IF NOT EXISTS "Stream" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "chatId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
); 