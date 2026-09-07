import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each worker is a separate process with its own database pool, and the pool
    // opens up to its own limit of connections. Left unbounded, the worker count
    // tracks the core count, and a machine with many cores runs enough
    // database-backed files at once to approach PostgreSQL's `max_connections`
    // (100) — a failure that would surface as a rare, machine-dependent flake in
    // whichever file loses the race for a connection rather than in the file
    // that took them. Capping the workers bounds the concurrent pools under the
    // ceiling, so the suite stays deterministic as the number of DB-backed files
    // grows. (`maxWorkers`, top-level: Vitest 4 removed `test.poolOptions`, and
    // this file is type-checked — see tsconfig `include` — so a key that no
    // longer exists fails the build rather than silently doing nothing.)
    maxWorkers: 4,
  },
});
