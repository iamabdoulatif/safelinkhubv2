import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { chargeWalletAtomically } from "@/lib/wallet/charge";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { purchaseMultiwanOnConnection } from "./payment";

// Opt-in isolated PostgreSQL schema. Never connect to production for tests.
test(
  "multiwan purchase: replay, concurrency, insufficient funds, quote changes and rollback",
  { skip: !process.env.MULTIWAN_TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({
      connectionString: process.env.MULTIWAN_TEST_DATABASE_URL,
      max: 5,
    });
    const schema = "mw_test_" + randomUUID().replaceAll("-", "");
    const connection = async () => {
      const c = await pool.connect();
      await c.query(`set search_path to ${schema}`);
      return c;
    };
    const admin = await pool.connect();
    try {
      await admin.query(
        `create schema ${schema}; set search_path to ${schema}`,
      );
      await admin.query(
        `create table organizations(id uuid primary key); create table users(id uuid primary key); create table routers(id uuid primary key,org_id uuid not null); create table wallet_transactions(id uuid primary key default gen_random_uuid(),org_id uuid,type text,purpose text,amount_cents integer,status text,payment_reference text,note text,created_by uuid,related_forward_id uuid,payment_method text,country_iso2 text,created_at timestamp default now()); create table safecoin_accounts(id uuid primary key default gen_random_uuid(),org_id uuid unique,balance_sc_cents integer,status text,updated_at timestamp); create table safecoin_settings(rate_fcfa_per_sc integer); create table safecoin_ledger(id uuid primary key default gen_random_uuid(),account_id uuid,org_id uuid,entry_type text,amount_sc_cents integer,reference_fcfa_cents integer,status text,idempotency_key text unique,reference_type text,reference_id text,note text,created_by uuid);`,
      );
      await admin.query(
        await readFile(
          process.env.MULTIWAN_TEST_SCHEMA_SQL ??
            new URL(
              "../../../scripts/add-multiwan-premium.sql",
              import.meta.url,
            ),
          "utf8",
        ),
      );
      const org = randomUUID(),
        otherOrg = randomUUID(),
        user = randomUUID(),
        routes = Array.from({ length: 7 }, () => randomUUID());
      await admin.query("insert into organizations values($1),($2)", [
        org,
        otherOrg,
      ]);
      await admin.query("insert into users values($1)", [user]);
      for (const id of routes)
        await admin.query("insert into routers values($1,$2)", [id, org]);
      await admin.query(
        "insert into wallet_transactions(org_id,type,amount_cents,status) values($1,'topup',45000,'completed')",
        [org],
      );
      await admin.query(
        "insert into safecoin_accounts(org_id,balance_sc_cents,status) values($1,45000,'active');",
        [org],
      );
      await admin.query("insert into safecoin_settings values(100)");
      const buy = async (
        routerId: string,
        source: "wallet" | "safecoin" = "wallet",
        quotedRate = 100,
        orgId = org,
      ) => {
        const c = await connection();
        try {
          return await purchaseMultiwanOnConnection(c, {
            routerId,
            orgId,
            userId: user,
            source,
            quotedRate,
          });
        } finally {
          c.release();
        }
      };
      const same = await Promise.all([
        buy(routes[0]),
        buy(routes[0]),
        buy(routes[0], "safecoin"),
      ]);
      assert.equal(same.filter((r) => !r.alreadyPaid).length, 1);
      assert.equal(
        Number(
          (
            await admin.query(
              "select count(*) from wallet_transactions where type='charge'",
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        (await admin.query("select balance_sc_cents from safecoin_accounts"))
          .rows[0].balance_sc_cents,
        45000,
      );
      await Promise.all([buy(routes[1]), buy(routes[2])]);
      await assert.rejects(buy(routes[3]), /insuffisant/);
      await assert.rejects(buy(routes[3], "safecoin", 101), /taux/);
      assert.equal(
        (await admin.query("select balance_sc_cents from safecoin_accounts"))
          .rows[0].balance_sc_cents,
        45000,
      );
      await buy(routes[3], "safecoin");
      assert.equal(
        (await admin.query("select balance_sc_cents from safecoin_accounts"))
          .rows[0].balance_sc_cents,
        30000,
      );
      await assert.rejects(
        buy(routes[4], "safecoin", 100, otherOrg),
        /introuvable/,
      );
      await admin.query(
        `create function reject_license() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$; create trigger reject_license before insert on router_multiwan_licenses for each row execute function reject_license();`,
      );
      await assert.rejects(buy(routes[4], "safecoin"), /test rollback/);
      assert.equal(
        (await admin.query("select balance_sc_cents from safecoin_accounts"))
          .rows[0].balance_sc_cents,
        30000,
      );
      assert.equal(
        Number(
          (await admin.query("select count(*) from safecoin_ledger")).rows[0]
            .count,
        ),
        1,
      );
      await admin.query(
        "insert into wallet_transactions(org_id,type,amount_cents,status) values($1,'topup',15000,'completed')",
        [org],
      );
      await assert.rejects(buy(routes[5]), /test rollback/);
      assert.equal(
        Number(
          (
            await admin.query(
              "select sum(case when type='topup' then amount_cents else -amount_cents end) as balance from wallet_transactions",
            )
          ).rows[0].balance,
        ),
        15000,
      );
      await admin.query(
        "drop trigger reject_license on router_multiwan_licenses; create table test_grants (router_id uuid references routers(id))",
      );
      const helperUrl = new URL(process.env.MULTIWAN_TEST_DATABASE_URL!);
      helperUrl.searchParams.set("options", "-csearch_path=" + schema);
      process.env.DATABASE_URL = helperUrl.toString();
      const competing = await Promise.allSettled([
        buy(routes[6]),
        chargeWalletAtomically(
          {
            orgId: org,
            type: "charge",
            amountCents: 15000,
            status: "completed",
            createdBy: user,
          },
          async (tx) => {
            await tx.execute(
              sql`insert into test_grants(router_id) values(${routes[5]})`,
            );
          },
          routes[5],
        ),
      ]);
      assert.equal(
        competing.filter((r) => r.status === "fulfilled").length,
        1,
        "only one service may consume the last wallet balance",
      );
      const balance = async () =>
        Number(
          (
            await admin.query(
              "select sum(case when type='topup' then amount_cents else -amount_cents end) as balance from wallet_transactions",
            )
          ).rows[0].balance,
        );
      assert.equal(await balance(), 0);
      await admin.query(
        "insert into wallet_transactions(org_id,type,amount_cents,status) values($1,'topup',15000,'completed')",
        [org],
      );
      await assert.rejects(
        chargeWalletAtomically(
          {
            orgId: org,
            type: "charge",
            amountCents: 15000,
            status: "completed",
          },
          async () => {
            throw new Error("grant failed");
          },
        ),
        /grant failed/,
      );
      assert.equal(
        await balance(),
        15000,
        "failed grant must roll back legacy wallet debit",
      );
      await getDb().$client.end();
    } finally {
      await admin.query(`drop schema ${schema} cascade`);
      admin.release();
      await pool.end();
    }
  },
);
