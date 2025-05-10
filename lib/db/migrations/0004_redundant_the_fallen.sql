CREATE TABLE IF NOT EXISTS "Vote" (
  "chatId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "isUpvoted" INTEGER NOT NULL,
  PRIMARY KEY ("chatId", "messageId"),
  FOREIGN KEY ("chatId") REFERENCES "Chat"("id"),
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
); 