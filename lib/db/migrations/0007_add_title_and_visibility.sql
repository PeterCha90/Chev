ALTER TABLE "Chat" ADD COLUMN "title" TEXT NOT NULL DEFAULT 'New Chat';
ALTER TABLE "Chat" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('public', 'private')); 