# AI Usage Meter — Project Handover

**Version:** 0.1.6  
**HEAD commit:** `59f6baa` on `main`  
**Date:** 2026-09-05  
**Repo:** https://github.com/walladanger/AI-Usage-Meter  
**Local path:** `C:\Users\Warwick\.codex\.chatgpt-projects\g-p-6a98b8cd6fa0819194212d5d3efb7f5c\AI-Usage-Meter-work`

---

## Continuation Prompt (copy-paste this to start the next session)

> Continue AI Usage Meter from GitHub main (commit `59f6baa`) and read `docs/HANDOFF.md` completely before doing anything else.
> Current version is 0.1.6. The chart pop-out white-page bug was fixed in this version — begin by having me install 0.1.6 and confirm:
> (1) the chart pop-out now renders with content (not a white page),
> (2) the X button on the pop-out closes it,
> (3) the tray panel renders at the correct 380 px width.
> If any of these still fail, collect the daily diagnostic log from `%APPDATA%\com.aiusagemeter.desktop\logs\` before changing any code.
> The next major engineering task after acceptance is implementing real API provider connections: Windows Credential Manager, Settings > Providers UI, and provider adapters for OpenAI, Anthropic, and Gemini. Do NOT claim automatic provider support without documented, tested, real-account-verified implementation.

---

## Security Constraints (IMMUTABLE — never override)

These were stated by the user and apply to every future change without exception:

1. **No cloud backend, telemetry, automated login, password capture, cookies, prompts, conversations, provider-page contents, or browsing history is approved.**
2. **Future secrets belong in Windows Credential Manager or another OS-backed store, never SQLite, frontend settings, source, Git, or logs.**
3. **Never log credentials, cookies, tokens, passwords, prompts, conversations, browsing history, provider HTML, allowance values, or reset timestamps.**
4. **Logs remain local unless the user explicitly copies/uploads them.**
5. **Loopback session token:** Fresh per launch; never written to disk.

---

## Stack

| Layer | Version / ID |
|---|---|
| Tauri | v2 (actual: 2.11.5) |
| React | 19 |
| TypeScript | 7 |
| Vite | 8 |
| Vitest | 4 |
| Rust edition | 2021 |
| Tailwind | 4.3.3 |

---

## Key Build Commands

```powershell
# Run all frontend tests (from repo root)
npm test

# Run Rust tests (CARGO_TARGET_DIR must be outside .codex)
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.6'
cargo test --manifest-path src-tauri/Cargo.toml

# Build installer for next version (bump version first — see Versioning below)
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.7'
npm run tauri:build -- --bundles nsis
```

**Why CARGO_TARGET_DIR must be outside `.codex`:** Windows Application Control blocks test executables in hidden folders.

**Test counts (0.1.6 baseline):** 42 frontend test files, 134 tests; 16 Rust tests.

---

## Versioning — How to Bump

Four files must match when cutting a new release:

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `package-lock.json` | `"version"` (top level) AND `"packages"."".version` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/tauri.conf.json` | `"version"` |

Next release will be **0.1.7**.

---

## Architecture Summary

### Window Types

| Window | Label | URL | Size |
|---|---|---|---|
| Main | `main` | `index.html` (no params) | 960 × 640 min |
| Tray panel | `tray-panel` | `index.html?window=external&feature=tray-panel` | 380 × 440 |
| Usage-trend pop-out | `ai-usage-meter-feature-usage-trend` | `index.html?window=external&feature=usage-trend` | 980 × 640 min |

### External Window Routing (how a pop-out knows which feature to render)

Two mechanisms, both active:

1. **Query params (primary):** `window.location.search` → `?window=external&feature=<id>` — set in `external_feature_url()` in `src-tauri/src/lib.rs`.
2. **Init script (backup):** `window.__AI_USAGE_METER_EXTERNAL_FEATURE__` injected by Tauri before page scripts run.

`selectExternalFeature()` in `src/external-windows/ExternalWindowRoute.tsx` reads whichever fires first.

### CSS Min-Width Gating

The `min-width: 960px` rule only applies to the main window. External pop-outs and the tray panel are excluded via:
- A synchronous IIFE in `src/main.tsx` adds class `ai-external-window` to `<html>` before React mounts.
- `src/styles/index.css` uses `html:not(.ai-external-window)` selectors.

### Data Flow (current state — fixture only)

```
App.tsx
  └─ UsageController(fixtureProviders, [])
       └─ fixtureProviders → fake data, isFixture: true
       └─ real adapters: []  ← nothing real until implemented
```

No real provider data flows at all. Every session starts with fixture data. The `UsageController` constructor's second argument is the real adapter list — it is always `[]`.

---

## Key Files

### Modified in 0.1.6

| File | What changed |
|---|---|
| [`index.html`](../index.html) | Added `<style>html,body{background:#171717;margin:0}</style>` to prevent WebView2 white flash before JS/CSS loads |
| [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) | `external_feature_url()` now embeds query params; Rust test updated |
| [`src/main.tsx`](../src/main.tsx) | Synchronous IIFE marks external windows with `ai-external-window` CSS class |
| [`src/styles/index.css`](../src/styles/index.css) | `min-width`/`min-height` rules gated to `html:not(.ai-external-window)` |
| Version files | Bumped to 0.1.6 across all four files |

### Modified by GitHub commits 791806e + 59f6baa (also in 0.1.6 build)

| File | What changed |
|---|---|
| [`src/design-system/colorProfiles.ts`](../src/design-system/colorProfiles.ts) | `withAlpha()` handles OKLCH colors from Tailwind v4 (was hex-only) |
| [`src/design-system/withAlpha.test.ts`](../src/design-system/withAlpha.test.ts) | Unit tests for `withAlpha()` — OKLCH and hex cases |

### Do Not Touch Without Explicit Approval

| File | Reason |
|---|---|
| `src/features/dashboard/Dashboard.tsx` | Frozen — approved design, reference image in `docs/screenshots/ai-usage-meter-dashboard-approved.png` |
| `src/features/dashboard/Dashboard.test.tsx` | Same |
| `src/features/dashboard/dashboard.css` | Same |

### Other Key Files (read-only reference)

| File | Purpose |
|---|---|
| `src/external-windows/ExternalWindowRoute.tsx` | `selectExternalFeature()` — routes pop-out to the right component |
| `src/windows/windowRegistry.ts` | Declares all pop-out window configs (bounds, component mapping) |
| `src/app/App.tsx` | Root: initializes `UsageController` with fixture providers + empty adapters |
| `src/external-windows/externalWindowService.ts` | `featureWindowLabel()` — used by frontend to open pop-outs via Tauri command |
| `src-tauri/tauri.conf.json` | CSP is `null`; tray panel URL with query params; main window has no `url` field |
| `src-tauri/migrations/0001_usage.sql` | SQLite schema — usage data only, never credentials |

---

## What is Working (0.1.6)

- **Dashboard** — renders correctly with fixture data; approved design locked.
- **Tray panel** — opens at 380 × 440, renders `TrayPanelWindow`.
- **Chart pop-out** — should now render content (not white page). **Physical acceptance required.**
- **X button on pop-out** — calls `getCurrentWindow().close()`; was always correct, just hidden by white page.
- **System tray** — icon, context menu, show/hide main window.
- **Main window close → hide to tray** — intercepted in `lib.rs` `on_window_event`.
- **Settings persistence** — `load_settings` / `save_settings` to `%APPDATA%\com.aiusagemeter.desktop\settings.json`.
- **Diagnostic logging** — daily log files in `%APPDATA%\com.aiusagemeter.desktop\logs\`.
- **Loopback ingestion** — local HTTP listener for extension data (extension not yet built).
- **OKLCH color support** — `withAlpha()` handles Tailwind v4 color format.
- **All 134 frontend tests pass; all 16 Rust tests pass.**

---

## What is NOT Working / Not Yet Implemented

### P0 — Acceptance Testing (do before any new code)

- [ ] Install 0.1.6 NSIS installer and physically verify pop-out renders content.
- [ ] Verify X button closes the pop-out.
- [ ] Verify tray panel renders at 380 px width (not 960 px minimum).
- See `docs/windows-test-checklist.md` for full checklist.

### P1 — Real API Connections (largest remaining Milestone 1 block)

This is the most important missing feature. Nothing real is implemented.

**Required work (in rough order):**

1. **Windows Credential Manager integration** — Rust: use `windows-credentials` or `keyring` crate to store/retrieve API keys. Frontend: Tauri commands `store_api_key(provider, key)` and `retrieve_api_key(provider)`. Keys must never appear in logs, settings.json, or SQLite.

2. **Settings > Providers UI** — A new card in `src/features/settings/UsageSettingsPage.tsx` (or a new `ProvidersSettingsCard.tsx`) for the user to enter and save API keys per provider (OpenAI, Anthropic, Gemini). Show masked value if key exists, "not configured" if not.

3. **OpenAI adapter** — Calls `/v1/organization/usage` (requires Org admin API key). Maps response to `UsageController`'s adapter contract.

4. **Anthropic adapter** — Calls Anthropic organization usage endpoint. Maps to same contract.

5. **Google Gemini adapter** — Calls Gemini API usage/quota endpoint. Maps to same contract.

6. **Wire adapters into `UsageController`** — In `src/app/App.tsx`, replace `[]` with the real adapter instances when keys are configured. The controller already supports a mixed list.

7. **Auto-refresh on real data** — Hook `request_usage_refresh` Tauri command into a timer or tray action. Infrastructure exists in `lib.rs`.

**Security notes for API work:**
- All HTTP calls to provider APIs go through a Rust async command — never from the frontend directly.
- Response bodies must be parsed in Rust; only the extracted usage numbers go to the frontend.
- Never log the raw response bodies (may contain prompt metadata).
- Provider API keys go into Windows Credential Manager, not anywhere else.

### P2 — Browser Extension

- Manifest V3 extension not built.
- Loopback listener exists in Rust (`src-tauri/src/loopback.rs`) and expects a pairing PIN flow.
- Extension would inject a content script to capture token counts from provider pages without logging the page content itself.
- Full spec in `docs/spec.md` (items 3–9).

### P3 — Windows Notifications

- Infrastructure exists in Tauri but no real data crosses alert thresholds yet.
- Spec §14.

### P4 — Export Usage History

- Spec §18. No implementation started.

---

## Diagnostic Log Location

```
%APPDATA%\com.aiusagemeter.desktop\logs\
```

Format: one file per day, e.g. `2026-09-05.log`. Read via Settings > Diagnostics in the app, or open the folder directly. If a pop-out or tray issue occurs after install, collect the log from the day of the incident before changing any code.

---

## Common Pitfalls

| Pitfall | How to avoid |
|---|---|
| `cargo test` builds to hidden folder inside `.codex` → blocked by Windows Application Control | Always set `$env:CARGO_TARGET_DIR` to a path outside `.codex` before running `cargo test` or `tauri:build` |
| `cargo fmt --check` fails on multiline assert! calls | Run `cargo fmt` before committing Rust changes |
| `withAlpha()` receiving OKLCH colors | Already handled in `colorProfiles.ts`; do not regress |
| Changing `min-width` in `index.css` | Must remain gated to `html:not(.ai-external-window)` or tray panel breaks |
| Committing API keys or tokens | Run `git diff --staged` before every commit; check all content |
| Four version files must match | Check all four every release (see Versioning section) |

---

## Git Workflow

- Branch: `main` (single-branch project so far)
- All merges via GitHub PRs (dependabot PRs merged via web UI; our commits pushed directly)
- Force-push was authorized for dependabot PR branches only — not for main

```powershell
# Standard commit after changes
git add <specific files>
git status  # verify nothing unexpected is staged
git commit -m "fix: description of what and why

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Recent Commit History

```
59f6baa test: add withAlpha unit tests
791806e fix: make withAlpha robust (sanitize alpha, handle OKLCH existing alpha)
d3b9644 fix: repair blank pop-out window and constrain min-width to main window (0.1.6)
b0d0c3d Merge pull request #3 from walladanger/dependabot/npm_and_yarn/tailwindcss-4.3.3
53e197b fix(design-system): handle OKLCH color format from Tailwind v4
```

---

## Installer Delivery

The 0.1.6 installer was built and downloaded by the user:

- **File:** `AI Usage Meter_0.1.6_x64-setup.exe`
- **Size:** 3,412,267 bytes
- **SHA-256:** `24E6BF58519DE601059376DEFCC9DE6C6F8EF527DF5AF6FBC3DBA691A3018B60`
- **Build incorporates:** commits up to and including `59f6baa`
