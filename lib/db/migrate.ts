import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

config({
  path: '.env.local',
});

const runMigrate = async () => {
  const sqlite = new Database('sqlite.db');
  const db = drizzle(sqlite);

  console.log('⏳ Running migrations...');

  const start = Date.now();

  const migrationsDir = './lib/db/migrations';
  const migrationFiles = fs.readdirSync(migrationsDir).sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql.split(';').filter((stmt) => stmt.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          sqlite.exec(statement);
        } catch (error) {
          console.error(`Error executing statement: ${statement}`);
          throw error;
        }
      }
    }
  }

  const end = Date.now();

  console.log('✅ Migrations completed in', end - start, 'ms');
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});
