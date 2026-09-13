import { defineConfig } from 'vitest/config';

// **One test run at a time against this repository.** The database-backed files
// each own a database named by a fixed constant — `valotech_content_serve`,
// `valotech_item_audience` and so on — and each drops and recreates it in
// `beforeAll` with `WITH (FORCE)`, which terminates whatever is connected. Two
// vitest invocations at once therefore destroy each other: the second run's
// setup pulls the first run's database out from under it mid-test, and what
// surfaces is a timeout in whichever files the two happened to share, never an
// assertion. Measured deliberately (`REVIEW/T1`): a full run alone is green at
// 1149 tests, and the same run with a second invocation of three of its files
// alongside fails exactly those files.
//
// The fixed name is the right trade — a per-run name would leak a database on
// every run, since the drop happens at setup rather than at teardown — so the
// constraint is written here rather than engineered around.

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
    // Vitest allows a test five seconds by default, which is generous for a pure
    // function and tight for one that opens a connection, runs a migration set
    // and makes a dozen round trips — on a machine that is also serving three
    // development servers. Measured on this box: the same test took 6569ms cold
    // and 149ms warm, and under a loaded box whole suites failed on five-second
    // timeouts while every one of them passed alone. What that produced was a
    // suite failing a different handful of tests every run, which is evidence
    // about nothing.
    //
    // Twenty seconds is three times the slowest honest measurement and a sixth
    // of the hook budget the database-backed files already declare, so a genuine
    // hang still fails and fails quickly enough to be read. It buys tolerance of
    // a busy machine, not tolerance of a deadlock (`REVIEW/T1`).
    testTimeout: 20_000,
  },
});
