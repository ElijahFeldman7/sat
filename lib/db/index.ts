import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

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
  const isTransactionMode = new URL(url).port === "6543";

  client = postgres(url, {
    ssl: "require",
    prepare: !isTransactionMode,
    // Small pool: this is a single-instance app, and pooler connections are a
    // shared project-wide budget.
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    // Every query is written against the app's own schema.
    connection: { search_path: "sat, public" },
    transform: { undefined: null },
    // schema.sql is idempotent, so every re-run emits "already exists" notices.
    onnotice: () => {},
  });

  return client;
}

let migrated: Promise<void> | null = null;

/**
 * Applies schema.sql once per process. Every statement is idempotent, but it is
 * ~40 statements and each request pays for a round trip to the database, so
 * probe for an existing schema first and skip the DDL entirely when it's there.
 */
export function ready(): Promise<void> {
  migrated ??= (async () => {
    try {
      await sql()`SELECT 1 FROM sat.sync_state LIMIT 1`;
      return;
    } catch {
      // Schema missing or incomplete — fall through and create it.
    }
    const ddl = readFileSync(path.join(process.cwd(), "lib/db/schema.sql"), "utf8");
    await sql().unsafe(ddl);
  })();
  return migrated;
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
