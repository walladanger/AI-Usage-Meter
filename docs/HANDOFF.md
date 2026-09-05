# AI Usage Meter — Project Handover

**Version:** 0.1.8
**Date:** 2026-09-05
**Repo:** https://github.com/walladanger/AI-Usage-Meter
**Local path:** `C:\Users\Warwick\.codex\.chatgpt-projects\g-p-6a98b8cd6fa0819194212d5d3efb7f5c\AI-Usage-Meter-work`

---

## Continuation Prompt (copy-paste this to start the next session)

> Continue AI Usage Meter and read `docs/HANDOFF.md` and `docs/provider-capability-matrix.md`
> completely before doing anything else. Current version is 0.1.8.
>
> 0.1.7 fixed the runaway settings-save loop that made 0.1.6 unusable, and added the first real
> provider connectors (OpenAI + Anthropic organization usage/cost) with keys in Windows Credential
> Manager, plus a hover-activated semi-transparent tray panel.
>
> **The connectors have NOT been verified against a real account.** Nothing may be described as
> working until it has returned real data. Begin by having me install 0.1.7 and confirm:
> (1) the chart pop-out renders content and its X button closes it,
> (2) hovering the tray icon shows the semi-transparent panel near the icon, and it stays open
>     when the pointer moves into it,
> (3) `settings.json` is no longer rewritten continuously — the daily log should be small,
> (4) Settings → Providers accepts an admin key and reports "Configured",
> (5) a refresh with a real key shows real token/cost figures on the Sources page, or a clear error.
> If anything fails, collect `%APPDATA%\com.aiusagemeter.desktop\logs\` before changing code.

---

## Security Constraints (IMMUTABLE — never override)

1. **No cloud backend, telemetry, automated login, password capture, cookies, prompts,
   conversations, provider-page contents, or browsing history is approved.**
2. **Secrets belong in Windows Credential Manager**, never SQLite, frontend settings, source,
   Git, or logs.
3. **Never log** credentials, cookies, tokens, passwords, prompts, conversations, browsing
   history, provider HTML, allowance values, or reset timestamps.
4. **Logs remain local** unless the user explicitly copies/uploads them.
5. **Loopback session token:** fresh per launch; never written to disk.

---

## What 0.1.8 changed

### Anthropic cost amounts were 100x too high — fixed

0.1.7 treated Anthropic's `cost_report` amounts as dollars. The API reference is explicit that
they are **cents**: "Cost amount in lowest currency units (e.g. cents) as a decimal string.
For example `"123.45"` in `"USD"` represents `$1.23`." A real $4.13 bill displayed as $412.80.

`ANTHROPIC_CENTS_PER_DOLLAR` in `src-tauri/src/providers.rs` now divides. Two regression tests
use the documented examples verbatim. `cost_unit_unverified` is now `false` for Anthropic; the
mechanism stays for any future provider whose unit is still unclear.

OpenAI's `amount.value` was already dollars and is deliberately **not** divided — a test pins
this so the two are never conflated.

### Capability matrix corrected

The main table contradicted the research addendum. OpenAI's *subscription allowance* and
*reset time* rows moved from NOT AVAILABLE to **PARTIAL** (a documented local source exists via
the Codex CLI app-server — still unverified), and *rate limits* moved to PARTIAL
(`x-ratelimit-*` response headers). Full detail and citations are in the dated addendum in
`docs/provider-capability-matrix.md`.

---

## What 0.1.7 changed

### 1. The runaway settings-save loop (root cause of the 0.1.6 symptoms)

`useNativeWindowStateLifecycle` in [`src/windows/windowState.ts`](../src/windows/windowState.ts)
depended on `load` and `save`, whose identities change every time settings are written:

```
save() -> settings.update() -> setSettings(new object)
       -> context useMemo re-fires -> new load/save identities
       -> effect deps change -> React runs cleanup
       -> cleanup calls persist() -> save()  ...forever
```

**Evidence from the 0.1.6 diagnostic log:** 391,946 `Settings save started` entries in 44
minutes (~148 disk writes/second), a 42 MB daily log, and interleaved/corrupted log lines from
two windows writing `settings.json` concurrently. Zero errors were recorded — the app was not
crashing, it was starving.

That starvation, not CSS or routing, is why the chart pop-out rendered white and why its X
button did nothing: `open_external_feature_window` is a synchronous command competing with the
loop for the main thread. The log's final line is `External window requested` with neither
`External window created` nor `External window build failed` after it.

**Fix:** the callbacks are held in refs, so only `windowId` can re-arm the teardown effect;
restore latches after the first successful restore. Regression test in
`src/windows/windowStateSettings.test.tsx` — it records **625 writes in 250 ms** against the
old code and **1** against the fixed code.

### 2. Real provider connectors

| Area | File |
|---|---|
| Windows Credential Manager | `src-tauri/src/credentials.rs` |
| OpenAI + Anthropic HTTP/parsing | `src-tauri/src/providers.rs` |
| Tauri commands | `src-tauri/src/lib.rs` |
| Frontend credential boundary | `src/settings/providerCredentialsService.ts` |
| Frontend adapter | `src/usage/apiProviderAdapter.ts` |
| Settings UI | `src/features/settings/ProvidersSettingsCard.tsx` |
| Returned-usage display | `src/features/sources/ApiUsageSummary.tsx` (Sources page) |

Design points:
* Every provider HTTPS call and all response parsing happens in Rust; only aggregate numbers
  cross the IPC boundary.
* `credentials::read` is `pub(crate)` — there is deliberately **no command that returns a
  stored key**. The UI only ever sees `{ configured, hint }` where `hint` is a masked tail.
* Errors carry a fixed message chosen from the HTTP status; response bodies are never read into
  an error or a log.
* Parsing is tolerant (candidate field names, missing = zero) because the schemas are not yet
  verified against a real account.
* Adapters are installed at startup only for providers with a stored key, via
  `UsageController.setAdapters`. Scheduled refresh honours `settings.usage.refreshMinutes`.

### 3. Tray hover panel

`src-tauri/src/tray.rs` now handles `TrayIconEvent::Enter` (position the panel near the icon and
show it) and `Leave` (hide after a 450 ms grace period, cancellable). The panel webview calls
`keep_tray_panel_open` on pointer-enter and `hide_tray_panel` on pointer-leave, so moving the
pointer from the icon into the panel keeps it open. The window is now `transparent: true`, and
`html.ai-tray-panel` (set in `src/main.tsx`) lets it opt out of the opaque background
`index.html` sets for the other windows. Left-click still toggles.

---

## What is NOT verified

**This is the most important section.** Per prompt §25, no provider integration may be claimed
to work until tested against a real account.

| Item | Status |
|---|---|
| OpenAI usage + cost connector | Implemented, unit-tested against synthetic payloads. **Never called with a real admin key.** |
| Anthropic usage + cost connector | Same. Additionally, the Admin API is unavailable to individual accounts, so this may return 404/403 for a personal Claude subscription. |
| Anthropic cost unit | **RESOLVED in 0.1.8.** The API reference is explicit: amounts are cents (`"123.45"` = `$1.23`). 0.1.7 reported them 100x too high; 0.1.8 divides by 100. |
| Gemini | **Not implemented.** No official usage endpoint exists; see the capability matrix. Manual entry only. |
| 0.1.7 installer behaviour | Built but not yet physically installed and exercised. |

---

## The distinction that governs the product

No provider offers an API for **subscription allowance** (ChatGPT/Codex, Claude Pro/Max, Gemini
app). The endpoints that exist report **organization API usage and cost**. An API-sourced
observation therefore leaves `remainingPercent` and `resetAt` undefined rather than inventing
them; allowance still comes from manual entry. Full detail and citations in
`docs/provider-capability-matrix.md`.

---

## Stack

| Layer | Version |
|---|---|
| Tauri | v2 (2.11.5) |
| React | 19 |
| TypeScript | 7 |
| Vite | 8 |
| Vitest | 4 |
| Rust edition | 2021 |
| Tailwind | 4.3.3 |
| keyring | 3 (windows-native) |
| reqwest | 0.12 (rustls) |

---

## Key Build Commands

```powershell
npm test

$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.8'
cargo test --manifest-path src-tauri/Cargo.toml

$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.9'
npm run tauri:build -- --bundles nsis
```

`CARGO_TARGET_DIR` must sit outside `.codex`: Windows Application Control blocks test
executables in hidden folders.

**Test counts (0.1.8):** 45 frontend files / 158 tests; 29 Rust tests.

---

## Versioning

Four files must match: `package.json`, `package-lock.json` (top-level **and**
`packages."".version`), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
Next release: **0.1.9**.

---

## Architecture

### Windows

| Window | Label | URL | Size |
|---|---|---|---|
| Main | `main` | `index.html` | 960 × 640 min |
| Tray panel | `tray-panel` | `index.html?window=external&feature=tray-panel` | 380 × 440, transparent |
| Chart pop-out | `ai-usage-meter-feature-usage-trend` | `index.html?window=external&feature=usage-trend` | 980 × 640 min |

External routing uses query params (primary) plus an init script (backup);
`selectExternalFeature()` reads whichever fires first. CSS min-width is gated to
`html:not(.ai-external-window)`; the tray panel additionally carries `html.ai-tray-panel`.

### Data flow

```
App.tsx
  └─ UsageController(fixtureProviders, [])
       └─ startup: read credential status -> setAdapters(createApiAdapters(configured))
       └─ scheduled refresh honours settings.usage.refreshMinutes
```

Providers without a stored key stay on fixture/manual data.

---

## Do Not Touch Without Explicit Approval

| File | Reason |
|---|---|
| `src/features/dashboard/Dashboard.tsx` | Frozen — approved design (`docs/screenshots/ai-usage-meter-dashboard-approved.png`) |
| `src/features/dashboard/Dashboard.test.tsx` | Same |
| `src/features/dashboard/dashboard.css` | Same |

---

## Remaining work

### P0 — Acceptance of 0.1.7
Install and confirm the five points in the continuation prompt. Verify a real admin key end to
end, then update the verification table in the capability matrix.

### P1 — Surface API usage on the Dashboard
`ApiUsageMetrics` is rendered on the **Sources** page by `ApiUsageSummary`, which is enough to
verify a key end to end. The **Dashboard** still shows `—` for an API-connected provider,
because an API observation has no `remainingPercent` and `Dashboard.tsx` is frozen. Deciding
what the dashboard card should show for an API-only provider needs explicit approval.

### P2 — Gemini connector
Cloud Monitoring time-series + OAuth. Materially heavier than an API key; see the matrix.

### P3 — Persist API metrics
`tauriSqlUsageRepository` stores the observation columns only; `apiUsage` is dropped. The daily
series would need a schema migration to feed the history charts.

### P4 — Browser extension, notifications, export
Unchanged from 0.1.6. Loopback listener exists in `src-tauri/src/loopback.rs`.

---

## Common Pitfalls

| Pitfall | Avoidance |
|---|---|
| React effects that write settings | Never depend on `load`/`save` from `useWindowStateSettings` — hold them in refs. See the 0.1.6 loop above. |
| `cargo test` in a hidden folder | Set `CARGO_TARGET_DIR` outside `.codex` |
| `cargo fmt --check` failures | Run `cargo fmt` before committing Rust |
| Committing API keys | `git diff --staged` before every commit |
| Four version files | Check all four every release |

---

## Diagnostic Log

`%APPDATA%\com.aiusagemeter.desktop\logs\`, one file per day. A healthy 0.1.7 log is small —
if it is tens of MB again, a save loop has regressed.



---

## Installer Delivery (0.1.8)

- **File:** `AI Usage Meter_0.1.8_x64-setup.exe`
- **Size:** 4,569,026 bytes
- **SHA-256:** `4032147FE663DD87990BECCD299228D452C803E2770030C992EF7F9EC6BF86C4`
- **Built:** 2026-09-05 16:31 from `5dd5627` (pushed to origin/main)
- **Path:** `C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.8\release\bundle\nsis\`

Supersedes 0.1.7, whose Anthropic cost figures were 100x too high.

**Not yet installed or exercised by a human, and no connector has seen a real key.**

### Acceptance checklist

1. Chart pop-out renders content; its X closes it.
2. Hovering the tray icon shows the panel near the icon; it stays open when the pointer
   moves into it; it is semi-transparent.
3. `%APPDATA%\com.aiusagemeter.desktop\logs\` stays small. Tens of MB means the save loop
   has regressed.
4. Settings > Providers accepts an admin key and reports "Configured".
5. Sources page shows real token/cost figures after a refresh, or a clear error.

See `docs/HANDOVER-0.1.8.md` for the full continuation brief and the Codex connector test.
