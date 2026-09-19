import assert from "node:assert/strict";
import { it } from "node:test";
import { deviceImage } from "./RestoreLive";

it("associe chaque board-name RouterOS à sa photo, sans confondre les hAP ax", () => {
  assert.equal(deviceImage("L009UiGS-2HaxD"), "/mikrotik/l009.webp");
  assert.equal(deviceImage("RB4011iGS+5HacQ2HnD"), "/mikrotik/rb4011.webp");
  assert.equal(deviceImage("RB5009UG+S+IN"), "/mikrotik/rb5009.webp");
  assert.equal(deviceImage("RB260GS"), "/mikrotik/rb260gs.webp");
  assert.equal(deviceImage("hAP ax lite"), "/mikrotik/hap-ax-lite.webp");
  assert.equal(deviceImage("L41G-2axD&FG621-EA"), "/mikrotik/hap-ax-lite-lte6.webp");
  assert.equal(deviceImage("hAP ax lite LTE6"), "/mikrotik/hap-ax-lite-lte6.webp");
  assert.equal(deviceImage("hAP ax^2"), "/mikrotik/hap-ax2.webp");
  assert.equal(deviceImage("C52iG-5HaxD2HaxD"), "/mikrotik/hap-ax2.webp");
  assert.equal(deviceImage("hAP ax^3"), "/mikrotik/hap-ax3.webp");
  assert.equal(deviceImage("hAP be^3 Media"), "/mikrotik/hap-be3-media.webp");
  assert.equal(deviceImage("hAP be lite"), "/mikrotik/hap-be-lite.webp");
  assert.equal(deviceImage("RB951Ui-2HnD"), null);
});
