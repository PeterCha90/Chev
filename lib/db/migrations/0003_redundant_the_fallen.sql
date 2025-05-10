CREATE TABLE IF NOT EXISTS "Message_v2" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "chatId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "parts" TEXT NOT NULL,
  "attachments" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
); 