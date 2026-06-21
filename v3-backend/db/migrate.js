// Applies db/schema.sql against DATABASE_URL.
// Usage: npm run migrate
// Safe to re-run — every statement in schema.sql uses IF NOT EXISTS.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    // gen_random_uuid() needs the pgcrypto extension on most Postgres providers.
    // Neon has it available; this just makes sure it's turned on.
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await pool.query(schema);
    console.log('Migration complete: sessions table is ready.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
