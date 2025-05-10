CREATE TABLE IF NOT EXISTS "Chat" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "messages" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id")
); 