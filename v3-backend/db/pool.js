// Shared connection pool — imported by server.js and any route file.
// Neon (and most managed Postgres) requires SSL; rejectUnauthorized:false
// avoids needing to vendor their CA cert for a small project like this.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5 // free-tier Postgres plans cap concurrent connections low; keep this conservative
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
});

module.exports = pool;
