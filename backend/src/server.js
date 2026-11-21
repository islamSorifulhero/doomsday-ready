const { Pool } = require('pg');
const { PostgresRepo } = require('./repo/postgres');
const SCHEMA = require('./schema');
const { createApp } = require('./app');
const { seedExampleData } = require('./seed');

const PORT = Number(process.env.PORT) || 4000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/doomsday';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The database container may still be starting, so retry for a while.
async function waitForDatabase(pool, attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`Waiting for the database (${i}/${attempts}): ${err.message}`);
      await sleep(2000);
    }
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  await waitForDatabase(pool);
  await pool.query(SCHEMA);

  const repo = new PostgresRepo(pool);
  if (process.env.SEED_EXAMPLE_DATA === 'true' && (await seedExampleData(repo))) {
    console.log('Seeded example data');
  }

  createApp(repo).listen(PORT, () => console.log(`API listening on http://localhost:${PORT}/api`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
