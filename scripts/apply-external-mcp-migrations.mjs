import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

// Runner restrito a esta entrega. Nunca carrega .env nem imprime conexão/chaves.
const files = [
  "20260911140000_0240_perfil_externo_sem_canal.sql",
  "20260911150000_0241_backfill_perfis_externos_mcp.sql",
];
const apply = process.argv.includes("--apply");
if (apply && new URL(process.env.NEXT_PUBLIC_APP_URL).hostname !== "xgoos.com.br") {
  throw new Error("release_target_mismatch");
}
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10_000 });
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout = '30s'");
  await db.query("set local lock_timeout = '5s'");
  if (apply) await db.query("select pg_advisory_xact_lock(hashtext('xgo-external-mcp-0241'))");
  const before = await db.query(`select
    (select count(*)::int from public.organizations) as organizations,
    (select count(*)::int from public.ai_agents) as agents,
    (select count(*)::int from public.organizations where settings->>'ai_dispatch_mode'='external'
      and coalesce(settings->'external_agent'->>'configuration_source','external')='external'
      and nullif(settings->'external_agent'->>'agent_id','') is null) as missing_profiles`);
  process.stdout.write(`BEFORE=${JSON.stringify(before.rows[0])}\n`);
  if (apply) {
    // Esta instalação nasceu por baseline, sem ledger CLI. Não inventamos
    // histórico anterior: registramos apenas os arquivos realmente aplicados.
    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
    await db.query("revoke all on schema supabase_migrations from public, anon, authenticated");
    await db.query("revoke all on supabase_migrations.schema_migrations from public, anon, authenticated");
    for (const file of files) {
      const version = file.slice(0, 14);
      const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
      const existing = await db.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
      if (existing.rowCount) {
        process.stdout.write(`MIGRATION=${version}:ALREADY_RECORDED\n`);
        continue;
      }
      await db.query(sql);
      await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
        [version, file.slice(15, -4), [sql]]);
      process.stdout.write(`MIGRATION=${version}:APPLIED:sha256=${createHash("sha256").update(sql).digest("hex")}\n`);
    }
  }
  const after = await db.query(`select
    (select count(*)::int from public.organizations) as organizations,
    (select count(*)::int from public.ai_agents) as agents,
    (select is_nullable from information_schema.columns where table_schema='public'
      and table_name='ai_agent_versions' and column_name='channel_session_id') as nullable_channel,
    (select count(*)::int from public.organizations o join public.ai_agents a
      on a.id::text=o.settings->'external_agent'->>'agent_id' and a.organization_id=o.id
      where a.config ? 'external_mcp_registration') as linked_profiles`);
  if (after.rows[0].organizations !== before.rows[0].organizations) throw new Error("organization_count_changed");
  if (apply && after.rows[0].nullable_channel !== "YES") throw new Error("channel_not_nullable");
  await db.query(apply ? "commit" : "rollback");
  process.stdout.write(`AFTER=${JSON.stringify(after.rows[0])}\nMODE=${apply ? "COMMITTED" : "READ_ONLY"}\n`);
} catch (error) {
  await db.query("rollback").catch(() => {});
  process.stderr.write(`MIGRATION_FAILED:${error.code ?? error.name}\n`);
  process.exitCode = 1;
} finally { await db.end(); }
