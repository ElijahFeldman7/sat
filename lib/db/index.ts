import postgres from "postgres";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

/**
 * Serverless platforms run many short-lived instances, each with its own pool,
 * against one shared pooler budget — so each instance keeps a single connection
 * and releases it quickly. A long-lived local process can afford more.
 */
const SERVERLESS = !!process.env.VERCEL;

/**
 * Postgres client for the Supabase project.
 *
 * `POOLER_URL` (the pooler) is preferred over `CONNECTION_STRING` (the direct
 * database host): pooling is what lets a small connection budget serve many
 * requests, and the direct host is IPv6-only, so it fails outright on IPv4
 * networks.
 *
 * The pooler port decides the mode. 6543 is transaction mode, where named
 * prepared statements break because connections are handed to a different
 * transaction mid-session, so they are disabled there. 5432 is session mode and
 * keeps them.
 */
function connectionString(): string {
  const url = process.env.POOLER_URL || process.env.CONNECTION_STRING;
  if (!url) {
    throw new Error(
      "No database URL — set POOLER_URL (preferred) or CONNECTION_STRING in .env",
    );
  }
  return url;
}

let client: postgres.Sql | null = null;

export function sql(): postgres.Sql {
  if (client) return client;

  const url = connectionString();
  const { hostname, port } = new URL(url);
  const isTransactionMode = port === "6543";
  // Supabase only accepts TLS; a Postgres running on the developer's own
  // machine usually has it switched off, and demanding it there fails the
  // connection outright.
  const isLocal = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);

  client = postgres(url, {
    ssl: isLocal ? false : "require",
    prepare: !isTransactionMode,
    max: SERVERLESS ? 1 : 5,
    idle_timeout: SERVERLESS ? 10 : 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    // Every query is written against the app's own schema.
    connection: { search_path: "sat, public" },
    transform: { undefined: null },
    // The schema DDL is idempotent, so re-runs emit "already exists" notices.
    onnotice: () => {},
  });

  return client;
}

let migrated: Promise<void> | null = null;

/** Arbitrary but stable key for the schema-creation advisory lock. */
const SCHEMA_LOCK = 4_820_119;

/**
 * Applies the schema once per process.
 *
 * Every statement is idempotent, but it is ~40 of them and each request pays a
 * round trip, so probe first and skip the DDL when the database is already at
 * this version. The probe is a *version*, not merely "does the schema exist" —
 * with an existence check, adding a table to SCHEMA_SQL would never reach any
 * database that had already been created. On a cold deploy many instances start
 * at once, so the write path takes an advisory lock and re-checks; otherwise
 * concurrent CREATEs race and some error out.
 *
 * Bump SCHEMA_VERSION whenever SCHEMA_SQL gains a statement.
 */
export function ready(): Promise<void> {
  migrated ??= (async () => {
    if (await schemaCurrent()) return;

    await sql().begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK})`;

      // Another instance may have applied it while we waited for the lock.
      // Two statements, not one with a CASE guard: Postgres resolves relations
      // when it parses, so a branch that merely *mentions* a missing table
      // still errors out.
      const [{ present }] = await tx<{ present: boolean }[]>`
        SELECT to_regclass('sat.schema_version') IS NOT NULL AS present
      `;
      if (present) {
        const [row] = await tx<{ version: number }[]>`SELECT version FROM sat.schema_version`;
        if ((row?.version ?? 0) >= SCHEMA_VERSION) return;
      }

      await tx.unsafe(SCHEMA_SQL);
      await tx.unsafe(
        `INSERT INTO sat.schema_version (only_row, version) VALUES (true, ${SCHEMA_VERSION})
         ON CONFLICT (only_row) DO UPDATE SET version = excluded.version, applied_at = now()`,
      );
    });
  })();
  return migrated;
}

async function schemaCurrent(): Promise<boolean> {
  try {
    const [row] = await sql()<{ current: boolean }[]>`
      SELECT COALESCE(
        (SELECT version FROM sat.schema_version), 0
      ) >= ${SCHEMA_VERSION} AS current
    `;
    return row?.current ?? false;
  } catch {
    // The table itself is missing on a fresh database.
    return false;
  }
}

/*
 * The driver serializes JS arrays of strings/numbers into Postgres text[]/int[],
 * but has no array serializer for booleans or dates. Send those as text[] and
 * cast the UNNEST column to the real type in SQL.
 */

export function boolArray(values: (boolean | null | undefined)[]): (string | null)[] {
  return values.map((v) => (v === null || v === undefined ? null : v ? "t" : "f"));
}

export function tsArray(values: (Date | null | undefined)[]): (string | null)[] {
  return values.map((v) => v?.toISOString() ?? null);
}

export type Row = Record<string, unknown>;

/**
 * Rewrites `?` placeholders to Postgres `$n`, so query strings stay readable
 * when an IN list is built from a variable number of values. The app never uses
 * the jsonb `?` operator, which is the only thing this would clash with.
 */
export function toPgPlaceholders(query: string): string {
  let n = 0;
  return query.replace(/\?/g, () => `$${++n}`);
}

export async function all<T = Row>(query: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const rows = await sql().unsafe(toPgPlaceholders(query), params as never[]);
  return rows as unknown as T[];
}

export async function get<T = Row>(query: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await all<T>(query, params);
  return rows[0];
}

export async function run(query: string, params: unknown[] = []): Promise<void> {
  await all(query, params);
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export async function transaction<T>(
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  await ready();
  return sql().begin(fn) as Promise<T>;
}

export async function close(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    migrated = null;
  }
}

/**
 * UUIDv7 — time-ordered, so drill-set ids insert sequentially into the primary
 * key index instead of scattering the way UUIDv4 does, while keeping 74 bits of
 * randomness (these ids appear in URLs and must not be guessable).
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
