// Optional isolated schema test. Install @electric-sql/pglite@0.3.15 in a temporary
// directory and set PGLITE_PACKAGE_ROOT to that directory. No hosted DB is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("database authorization, atomic audit and partner isolation", async () => {
  assert.ok(process.env.PGLITE_PACKAGE_ROOT, "Set PGLITE_PACKAGE_ROOT to the temporary validation installation");
  const require = createRequire(join(process.env.PGLITE_PACKAGE_ROOT, "package.json"));
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
    `);
    for (const name of ["001_initial_schema", "002_api_policies_and_lifecycle", "003_atomic_create_and_start", "006_partner_webhook_events", "008_partner_work_orders"]) {
      const sql = readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8").replace('create extension if not exists "pgcrypto";', "");
      await db.exec(sql);
    }
    await db.exec("grant all on all tables in schema public to anon, authenticated, service_role;");
    await db.exec(readFileSync(new URL("../supabase/migrations/009_security_hardening.sql", import.meta.url), "utf8"));
    const reporter = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const staff = "00000000-0000-4000-8000-000000000003";
    const attacker = "00000000-0000-4000-8000-000000000004";
    const location = "00000000-0000-4000-8000-000000000010";
    const category = "00000000-0000-4000-8000-000000000011";
    await db.exec(`insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values
      ('${reporter}','{"role":"reporter"}','{}'),('${other}','{"role":"reporter"}','{}'),
      ('${staff}','{"role":"staff"}','{}'),('${attacker}','{}','{"role":"staff"}');
      insert into public.locations(id,building,floor_room) values('${location}','Test','Test');
      insert into public.categories(id,name,sla_hours) values('${category}','Electrical',8);`);
    async function actor(id, role, sql, args = []) {
      return db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, app_metadata: { role }, user_metadata: { role: "staff" } })]);
        return tx.query(sql, args);
      });
    }
    async function partner(sql, args = []) {
      return db.transaction(async (tx) => { await tx.exec("set local role service_role"); return tx.query(sql, args); });
    }
    const countHistory = async (id) => Number((await db.query("select count(*) as n from public.status_history where work_order_id=$1", [id])).rows[0].n);
    const created = await actor(reporter, "reporter", "select * from public.create_work_order($1,$2,$3,$4,$5)", [reporter, location, "Test leak", category, "Test"]);
    const id = created.rows[0].id;
    assert.equal(await countHistory(id), 1);
    assert.equal((await actor(other, "reporter", "select * from public.work_orders where id=$1", [id])).rows.length, 0);
    assert.equal((await actor(attacker, null, "select public.current_user_is_staff() as staff")).rows[0].staff, false);
    assert.equal((await actor(attacker, null, "select * from public.work_orders")).rows.length, 0);
    await assert.rejects(actor(reporter, "reporter", "select public.assign_work_order($1,$2)", [id, staff]));
    await assert.rejects(actor(reporter, "reporter", "insert into public.status_history(work_order_id,changed_by,to_status) values($1,$2,'OPEN')", [id, reporter]));
    await assert.rejects(actor(staff, "staff", "select public.assign_work_order($1,$2)", [id, attacker]));
    assert.equal(await countHistory(id), 1, "Failed assignments roll back both state and audit");
    await assert.rejects(actor(staff, "staff", "update public.work_orders set status='CLOSED',resolution_notes='skip' where id=$1", [id]));
    await actor(staff, "staff", "select public.assign_work_order($1,$2)", [id, staff]);
    await actor(staff, "staff", "select public.start_work_order($1)", [id]);
    await assert.rejects(actor(staff, "staff", "select public.resolve_work_order($1,'   ')", [id]));
    await actor(staff, "staff", "select public.resolve_work_order($1,'Repair completed')", [id]);
    await assert.rejects(actor(staff, "staff", "update public.work_orders set resolution_notes='' where id=$1", [id]));
    await actor(staff, "staff", "select public.close_work_order($1)", [id]);
    assert.equal(await countHistory(id), 5);
    await assert.rejects(partner("delete from public.work_orders where id=$1", [id]));
    await assert.rejects(partner("delete from public.status_history where work_order_id=$1", [id]));
    await assert.rejects(partner("update public.status_history set note='forged' where work_order_id=$1", [id]));
    await assert.rejects(partner("insert into public.status_history(work_order_id,to_status) values($1,'OPEN')", [id]),
      "Even the service role cannot append history outside the audit trigger");
    await assert.rejects(actor(staff, "staff", "update public.work_orders set reporter_id=$1 where id=$2", [other, id]));
    const createSql = "select public.create_partner_work_order($1,$2,$3,$4,$5,$6) as result";
    const args = ["Partner test", "Setup", category, location, "activity-security-1", "idem-security-1"];
    await assert.rejects(actor(reporter, "reporter", createSql, args));
    const first = (await partner(createSql, args)).rows[0].result;
    const replay = (await partner(createSql, args)).rows[0].result;
    assert.equal(first.duplicate, false);
    assert.equal(replay.duplicate, true);
    assert.equal(first.work_order.id, replay.work_order.id);
    assert.equal(first.work_order.reporter_id, null);
    assert.equal(await countHistory(first.work_order.id), 1);
    await assert.rejects(partner(createSql, [...args.slice(0, 4), "another-activity", args[5]]));
    const modifySql = "select * from public.modify_partner_work_order($1,$2,$3,$4,$5,$6,$7)";
    await assert.rejects(partner(modifySql, [id, null, true, null, null, null, null]), "Partner must not mutate a student ticket");
    await assert.rejects(partner(modifySql, [first.work_order.id, "wrong-activity", true, null, null, null, null]));
    await partner(modifySql, [first.work_order.id, args[4], true, null, null, null, null]);
    assert.equal(await countHistory(first.work_order.id), 2, "Cancellation is audited atomically");
    await assert.rejects(partner(modifySql, [first.work_order.id, args[4], false, "change", null, null, null]));
    const immutable = await db.query("select to_status from public.status_history where work_order_id=$1 order by timestamp,id", [id]);
    assert.equal(immutable.rows.length, 5);
    await db.query("update auth.users set raw_app_meta_data='{}' where id=$1", [staff]);
    assert.equal((await actor(staff, "staff", "select public.current_user_is_staff() as staff")).rows[0].staff, false,
      "A stale JWT must not retain a revoked staff role");
    assert.equal((await actor(staff, "staff", "select * from public.work_orders")).rows.length, 0);
  } finally { await db.close(); }
});
