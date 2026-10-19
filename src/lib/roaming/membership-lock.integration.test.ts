import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getDb } from "@/lib/db";
import { acquireRoamingMembershipLock } from "./membership-lock";
test(
  "PostgreSQL serializes zone changes with issuance reservations",
  { skip: !process.env.ROAMING_TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.ROAMING_TEST_DATABASE_URL;
    const group = randomUUID(),
      pool = getDb().$client;
    const release = await acquireRoamingMembershipLock(group);
    assert.ok(release);
    const tx = await pool.connect();
    try {
      assert.equal(await acquireRoamingMembershipLock(group), null);
      await tx.query("begin");
      const locked = await tx.query(
        "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",
        [`roaming-membership:${group}`],
      );
      assert.equal(
        locked.rows[0].locked,
        false,
        "a zone change blocks a reservation",
      );
      await tx.query("rollback");
      await release();
      await tx.query("begin");
      assert.equal(
        (
          await tx.query(
            "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",
            [`roaming-membership:${group}`],
          )
        ).rows[0].locked,
        true,
      );
      assert.equal(
        await acquireRoamingMembershipLock(group),
        null,
        "a reservation blocks a zone change",
      );
      await tx.query("rollback");
      const again = await acquireRoamingMembershipLock(group);
      assert.ok(again);
      await again();
    } finally {
      await tx.query("rollback");
      tx.release();
      await pool.end();
    }
  },
);
