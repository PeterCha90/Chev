import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

config({
  path: '.env.local',
});

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './sqlite.db',
  },
} satisfies Config;
