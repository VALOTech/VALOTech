// Prove the down-migration runs, against a throwaway database — never the
// developer's own (DATA-R06, INFRA-001/T4). The round trip's middle step is a
// DROP; run in place and a stray DATABASE_URL costs real data. This creates a
// scratch database beside the target, runs up -> down -> up on it, and drops
// it, so the proof touches nothing that matters and starts from virgin ground
// each time (the second `up` then re-creates the extension the down left,
// which is the property running in place would quietly skip).
import { runner } from 'node-pg-migrate';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url || url.trim() === '') {
  console.error('migrate-roundtrip: DATABASE_URL is not set');
  process.exit(1);
}

const parsed = new URL(url);
const base = parsed.pathname.replace(/^\//, '');
const scratch = `${base}_roundtrip`;

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const scratchUrl = new URL(url);
scratchUrl.pathname = `/${scratch}`;

console.log(`migrate-roundtrip: ${parsed.host}/${scratch} as ${parsed.username}`);

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

// A double-quoted identifier is safe here: `scratch` derives from the target
// database name in DATABASE_URL, which the developer controls, and the only
// meta-character an identifier admits is a quote, which a valid database name
// does not carry.
const drop = () => admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);

const migrateOptions = {
  databaseUrl: scratchUrl.toString(),
  dir: 'migrations',
  migrationsTable: 'pgmigrations',
  log: () => {},
};

try {
  await drop(); // clear any database a previous crashed run left behind
  await admin.query(`CREATE DATABASE "${scratch}"`);

  // Down the whole chain, not one migration: DATA-001/T10 asks that *every*
  // migration's down has been run, and a fold (DATA-R07) can rewrite an old
  // down that a one-step roundtrip would never re-exercise. Full down -> full
  // up on virgin ground proves each down reverses, in reverse order.
  await runner({ ...migrateOptions, direction: 'up', count: Infinity });
  await runner({ ...migrateOptions, direction: 'down', count: Infinity });
  await runner({ ...migrateOptions, direction: 'up', count: Infinity });

  console.log('migrate-roundtrip: up -> down -> up complete');
} finally {
  await drop();
  await admin.end();
}
