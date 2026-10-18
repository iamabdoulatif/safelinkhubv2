import assert from "node:assert/strict";
import { test } from "node:test";
import { createHealthSchedule } from "./health-schedule";

test("a long health pass does not skip the next traffic collection", async () => {
  let traffic = 0, health = 0;
  let finishHealth!: () => void;
  const healthWait = new Promise<void>(resolve => { finishHealth = resolve; });
  const schedule = createHealthSchedule(async () => { traffic++; }, async () => { health++; await healthWait; });
  const jobs: (() => Promise<void>)[] = [];
  assert.equal(schedule(job => { jobs.push(job); }), true);
  const first = jobs.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(health, 1);
  assert.equal(schedule(job => { jobs.push(job); }), true);
  await jobs.shift()!();
  assert.equal(traffic, 2);
  assert.equal(health, 1);
  finishHealth();
  await first;
});

test("overlapping ticks do not duplicate traffic or health; failures release reservations", async () => {
  const jobs: (() => Promise<void>)[] = [];
  let traffic = 0, health = 0;
  const schedule = createHealthSchedule(async () => { traffic++; throw new Error("network"); }, async () => { health++; });
  assert.equal(schedule(job => { jobs.push(job); }), true);
  assert.equal(schedule(job => { jobs.push(job); }), false);
  await assert.rejects(jobs.shift()!(), /network/);
  assert.equal(schedule(job => { jobs.push(job); }), true);
  await assert.rejects(jobs.shift()!(), /network/);
  assert.equal(traffic, 2);
  assert.equal(health, 0);
});

test("finishing older health work cannot release a newer traffic reservation", async () => {
  let traffic = 0, health = 0;
  let releaseHealth!: () => void, releaseTraffic!: () => void;
  const healthWait = new Promise<void>(resolve => { releaseHealth = resolve; });
  const trafficWait = new Promise<void>(resolve => { releaseTraffic = resolve; });
  const schedule = createHealthSchedule(async () => { if (++traffic === 2) await trafficWait; }, async () => { if (++health === 1) await healthWait; });
  const jobs: (() => Promise<void>)[] = [];
  schedule(job => { jobs.push(job); });
  const first = jobs.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  schedule(job => { jobs.push(job); });
  const second = jobs.shift()!();
  releaseHealth();
  await first;
  schedule(job => { jobs.push(job); });
  await jobs.shift()!();
  assert.equal(traffic, 2);
  assert.equal(health, 2);
  releaseTraffic();
  await second;
});
