# Runtime Controls and Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore native actions that silently fall back to browser no-ops, make refresh clicks produce an accurate result, and identify this iteration as version `0.1.1`.

**Architecture:** Use the public Tauri `isTauri()` API as the single runtime signal and route every native adapter through it. Keep automatic usage connectors out of scope; the refresh controller will return a summary so the existing dashboard can explain when no refresh-capable source exists. Preserve the approved dashboard layout and Ember shell styling.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, Vite.

**Spec:** `docs/HANDOFF.md` plus the user-reported installed-app screenshot from 2026-09-03.

## Global Constraints

- GitHub `main` is the source of truth.
- Preserve the approved dashboard and unrelated Ember foundation behavior.
- Do not invent provider APIs, usage values, or connector support.
- Do not claim physical Windows verification without testing the installer on Windows.
- Do not commit or push during this session; leave the verified diff for user review.

---

### Task 1: Restore the Tauri native runtime boundary

**Files:**
- Modify: `src/windows/nativeWindowService.test.tsx`
- Create: `src/runtime/tauriRuntime.ts`
- Modify: `src/windows/nativeWindowService.ts`
- Modify: `src/main.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/external-windows/externalWindowService.ts`
- Modify: `src/settings/settingsService.ts`
- Modify: `src/settings/startupService.ts`
- Modify: `src/windows/windowState.ts`
- Modify: `src/usage/tauriSqlUsageRepository.ts`
- Modify: `src/features/tray/TrayPanelWindow.tsx`

**Interfaces:**
- Produces: `isTauriRuntime(): boolean`, backed by `@tauri-apps/api/core.isTauri`.
- Consumes: the official Tauri runtime flag installed as `globalThis.isTauri`.

- [ ] **Step 1: Write the failing runtime-detection regression test**

Add a test that sets `globalThis.isTauri = true` without creating the obsolete private marker and expects `isTauriRuntime()` to return `true`.

- [ ] **Step 2: Run the focused test and confirm the old check returns `false`**

Run: `npm test -- src/windows/nativeWindowService.test.tsx`

- [ ] **Step 3: Implement the public runtime helper and replace every private-marker check**

```ts
import { isTauri } from '@tauri-apps/api/core';

export function isTauriRuntime(): boolean {
  return isTauri();
}
```

Use this helper for window controls, chart pop-outs, settings, startup, window-state persistence, SQLite, tray commands, navigation listeners, and diagnostics.

- [ ] **Step 4: Run the focused test and the affected service tests**

Run: `npm test -- src/windows/nativeWindowService.test.tsx src/external-windows/externalWindowService.test.ts src/settings/settingsService.test.ts src/settings/startupService.test.ts src/usage/tauriSqlUsageRepository.test.ts`

### Task 2: Replace silent refresh no-ops with an accurate result

**Files:**
- Modify: `src/usage/usageStore.test.ts`
- Modify: `src/usage/usageStore.tsx`
- Modify: `src/features/dashboard/Dashboard.test.tsx`
- Modify: `src/features/dashboard/Dashboard.tsx`
- Modify: `src/features/refresh/RefreshPage.tsx`
- Modify: `src/features/dashboard/dashboard.css`

**Interfaces:**
- Produces: `RefreshSummary { attempted: number; succeeded: number; failed: number }`.
- Changes: `refreshAll(): Promise<RefreshSummary>` and `refreshProvider(): Promise<boolean>`.

- [ ] **Step 1: Write failing controller and dashboard behavior tests**

The controller test expects an empty-adapter refresh to return `{ attempted: 0, succeeded: 0, failed: 0 }`. The dashboard test clicks refresh and expects a visible status explaining that no automatic source is available in this build and manual entry remains available under Sources.

- [ ] **Step 2: Run the focused tests and confirm the result/message are missing**

Run: `npm test -- src/usage/usageStore.test.ts src/features/dashboard/Dashboard.test.tsx`

- [ ] **Step 3: Implement the minimal summary and visible refresh feedback**

Count attempted adapters and their success/failure results. Disable only while a refresh is in progress; show a live status after completion without changing dashboard layout.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `npm test -- src/usage/usageStore.test.ts src/features/dashboard/Dashboard.test.tsx`

### Task 3: Bump and verify iteration version `0.1.1`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: synchronized frontend, lockfile, Tauri bundle, and Rust crate version `0.1.1`.

- [ ] **Step 1: Update all four version declarations to `0.1.1`**

- [ ] **Step 2: Verify the declarations are identical**

Run a read-only version check over the four metadata files and fail if any differ.

### Task 4: Full verification

**Files:**
- Verify only; no additional production changes unless a test exposes a scoped defect.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

- [ ] **Step 2: Build the optimized frontend**

Run: `npm run build`

- [ ] **Step 3: Run the production-bundle smoke test**

Run: `npm run test:production-bundle`

- [ ] **Step 4: Check the native Rust crate**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 5: Review the final diff and confirm approved dashboard markup/styling remains unchanged except for the small refresh status**

