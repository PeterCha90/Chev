-- Create a temporary table with the new schema
CREATE TABLE "Chat_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New Chat',
  "userId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('public', 'private')),
  FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- Copy data from the old table to the new table
INSERT INTO "Chat_new" ("id", "createdAt", "userId")
SELECT "id", "createdAt", "userId" FROM "Chat";

-- Drop the old table
DROP TABLE "Chat";

-- Rename the new table to the original name
ALTER TABLE "Chat_new" RENAME TO "Chat"; 