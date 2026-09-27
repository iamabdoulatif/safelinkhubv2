# Dashboard Chart Load Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animate dashboard bar charts and line charts progressively on initial render while preserving accessibility and layout stability.

**Architecture:** Keep animation behavior inside the reusable `BarChart` and `LineChart` client components. Use CSS keyframes for bar growth and SVG stroke-dash animations for polylines; rely on the existing global reduced-motion rule. Extend the source-level dashboard chart tests to guard the implementation contract.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind classes, global CSS, Node test runner.

---

### Task 1: Add regression coverage for chart animation hooks

**Files:**
- Modify: `test/dashboard-tiles.test.mjs`

- [ ] **Step 1: Write failing assertions**

Add tests that require `BarChart.tsx` to expose indexed animation delays and a bar animation class, require `LineChart.tsx` to expose SVG stroke animation and indexed series delays, and require `globals.css` to define the corresponding keyframes.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- test/dashboard-tiles.test.mjs`

Expected: FAIL because the chart components and stylesheet do not yet contain the new animation hooks.

### Task 2: Implement progressive bar animation

**Files:**
- Modify: `src/components/charts/BarChart.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the minimal CSS keyframe**

Define `@keyframes chart-bar-rise` from `transform: scaleY(0)` to `transform: scaleY(1)` and anchor the transform at the bottom edge.

- [ ] **Step 2: Apply indexed delays**

Keep the existing computed height, add a `chart-bar-rise` class to each value bar, and set `animationDelay` to `i * 55ms` through the existing style object. The bar must keep its final height after the animation.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- test/dashboard-tiles.test.mjs`

Expected: bar animation assertions pass; line animation assertions remain the only failures.

### Task 3: Implement progressive line animation

**Files:**
- Modify: `src/components/charts/LineChart.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the minimal CSS keyframe**

Define `@keyframes chart-line-draw` from `stroke-dashoffset: 1` to `stroke-dashoffset: 0` and set `stroke-dasharray: 1` so the SVG path length can be normalized with `pathLength={1}`.

- [ ] **Step 2: Apply the animation to each series**

Add `pathLength={1}`, the `chart-line-draw` class, and an indexed delay of `seriesIndex * 120ms` to each polyline. Keep the line data, hover markers, colors, and accessible labels unchanged.

- [ ] **Step 3: Run the focused tests**

Run: `npm test -- test/dashboard-tiles.test.mjs`

Expected: PASS.

### Task 4: Verify the complete dashboard

**Files:**
- No new files.

- [ ] **Step 1: Run static validation**

Run: `npm run typecheck && npm run lint -- --quiet`

Expected: both commands pass.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Inspect the local dashboard**

Open `http://localhost:3000/admin`, reload the page, and verify that bars rise from the baseline and line series draw in sequence. Enable reduced motion in the browser or OS settings and verify the charts appear immediately.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/components/charts/BarChart.tsx src/components/charts/LineChart.tsx src/app/globals.css test/dashboard-tiles.test.mjs
git commit -m "feat: animate dashboard charts on load"
```
