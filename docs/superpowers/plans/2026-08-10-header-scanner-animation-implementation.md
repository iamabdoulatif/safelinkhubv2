# Header Scanner Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the selected « cadre scanner » animation to SafeLinkHub’s public-header navigation without changing navigation behavior.

**Architecture:** Keep the component’s routes, ARIA attributes and state model unchanged. Add semantic class names in `LandingNav`, then centralize all animation and reduced-motion behavior in the existing global Bitume stylesheet so desktop links and mobile-menu entries share one visual language.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, global CSS.

---

### Task 1: Add reusable scanner-motion styles

**Files:**
- Modify: `src/app/globals.css`
- Test: browser verification of hover, focus-visible and reduced-motion states

- [x] **Step 1: Establish the initial visual baseline**

Run the app and capture `LandingNav` at desktop width and 390 px. Confirm that desktop links use only the existing hover background, mobile entries are static, and the header has no horizontal overflow.

- [x] **Step 2: Add the scanner and mobile-entry CSS**

Add a `.nav-scanner-link` rule with an absolutely positioned, mustard two-pixel pseudo-element. Hide it by opacity and a small upward/contracted transform. On `:hover` and `:focus-visible`, reveal it over 160 ms with a two-step timing function; move the link label by two pixels without changing layout. Add `.nav-mobile-panel` and `.nav-mobile-item` entry keyframes, staggered through CSS custom-property delays.

Add a `@media (prefers-reduced-motion: reduce)` block that removes animation and transform while preserving the visible focus frame.

- [x] **Step 3: Verify the CSS behavior**

At desktop width, hover every navigation link and tab through the list. At 390 px, open the mobile menu and confirm that links enter in order without horizontal overflow. Emulate reduced motion and confirm that the frame appears immediately.

### Task 2: Apply the styles to the public navigation

**Files:**
- Modify: `src/components/landing/LandingNav.tsx`
- Test: browser verification of route and anchor activation

- [x] **Step 1: Apply the desktop animation class to navigation links**

Replace the duplicated desktop link styling with a shared `nav-scanner-link` class while retaining the current padding, font and route/anchor behavior. Keep `Link` for routes and `<a>` for page anchors.

- [x] **Step 2: Apply the mobile animation classes**

Add `nav-mobile-panel` to the conditional mobile `<nav>`. Give each `<li>` a `nav-mobile-item` class and an index-derived `--nav-index` style so its entry delay is deterministic. Leave `onClick={() => setOpen(false)}` unchanged.

- [x] **Step 3: Verify functional navigation**

Click a desktop route link, an anchor link and a mobile menu link. Confirm that their destinations remain unchanged and that the menu still closes after selection.

### Task 3: Validate, commit and release

**Files:**
- Modify: `docs/superpowers/plans/2026-08-10-header-scanner-animation-implementation.md`

- [x] **Step 1: Run static verification**

Run `npm run typecheck`, `npm test` and `npm run build`. Resolve any failure before releasing.

- [x] **Step 2: Run the visual regression check**

Capture desktop and 390 px screenshots. Confirm that the scanner frame preserves contrast, never clips the text, respects reduced motion and does not disturb the header layout.

- [ ] **Step 3: Commit and deploy**

Stage the CSS, component and implementation plan; create a commit with `feat(landing): animate header navigation`; then create a production deployment with `vercel deploy --prod` and report its URL and status.
