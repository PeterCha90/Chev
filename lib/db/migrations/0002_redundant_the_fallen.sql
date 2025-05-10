CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "chatId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
); 