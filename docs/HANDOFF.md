# AI Usage Meter — Project Handover

**Version:** 0.1.10
**Date:** 2026-09-05
**Repo:** https://github.com/walladanger/AI-Usage-Meter
**Local path:** `C:\Users\Warwick\.codex\.chatgpt-projects\g-p-6a98b8cd6fa0819194212d5d3efb7f5c\AI-Usage-Meter-work`

---

## Continuation Prompt (copy-paste this to start the next session)

> Continue AI Usage Meter and read `docs/HANDOFF.md` and `docs/provider-capability-matrix.md`
> completely before doing anything else. Current version is 0.1.10.
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

## What 0.1.10 changed

### The Codex allowance connector — the app now answers its headline question

`src-tauri/src/codex.rs` spawns the local Codex CLI app-server, performs the JSON-RPC
handshake, calls `account/rateLimits/read`, and returns `usedPercent`, `windowDurationMins`
and `resetsAt` for both quota windows, plus plan, credits and available rate-limit resets.

**This is the only source in the project that reports allowance rather than spend**, and the
only adapter permitted to populate `remainingPercent`, `usedPercent` and `resetAt`. The API
connectors deliberately leave those undefined because usage endpoints report what was spent.

Verified end to end against a real account on `codex-cli 0.148.0-alpha.9` via an ignored
integration test (`live_fetch_returns_a_usable_snapshot`), not just unit tests over fixtures.

Three implementation details that were found by testing, not from the docs:

* **stdin must stay open.** Closing it after writing makes the process exit before the
  asynchronous reply arrives, which is indistinguishable from an unsupported method.
* **The binary is not reliably on PATH.** It was at `~/.codex/.sandbox-bin/codex.exe` on the
  verification machine, so `locate_codex()` checks PATH and then known install locations.
* **`CREATE_NO_WINDOW` is required on Windows**, or a console flashes on every refresh.

Only `usedPercent` is required by the protocol schema; `windowDurationMins` and `resetsAt`
are nullable and every field is parsed defensively. A missing percentage is omitted rather
than defaulted to zero, since zero reads as "no allowance left".

### The binding window

Codex reports two windows (5-hour and weekly). The connector reports whichever is closest to
exhaustion, because that is what actually stops work. This was observed changing in practice:
the 5-hour window was binding while exhausted, and the weekly window became binding after it
reset.

### Composition with the OpenAI API connector

Both describe the same provider but answer different questions, and `UsageController` keys
adapters by provider, so one would silently replace the other. `CodexWithApiSpendAdapter`
merges them: allowance from Codex, spend from the API. A Codex failure fails the pair; an API
failure only omits the spend detail, since allowance is the headline figure.

### The frozen Dashboard now works unmodified

`ProviderPanel` already read `remainingPercent`, `resetAt`, and a `'cli'` source type. Because
Codex fills those fields, the approved dashboard displays real allowance and a live countdown
**without any change to the frozen files**. Sources gains `CodexAllowanceCard` for what has no
equivalent elsewhere: both windows, the plan, and any unused rate-limit reset — a user can be
blocked while holding one.

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

$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.10'
cargo test --manifest-path src-tauri/Cargo.toml

$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.11'
npm run tauri:build -- --bundles nsis
```

`CARGO_TARGET_DIR` must sit outside `.codex`: Windows Application Control blocks test
executables in hidden folders.

**Test counts (0.1.10):** 47 frontend files / 179 tests; 36 Rust tests (+1 ignored live test).

---

## Versioning

Four files must match: `package.json`, `package-lock.json` (top-level **and**
`packages."".version`), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
Next release: **0.1.11**.

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

## Installer Delivery (0.1.10)

- **File:** `AI Usage Meter_0.1.10_x64-setup.exe`
- **Size:** 4,589,730 bytes
- **SHA-256:** `210C7A99400E5DC009DB0004961E87C55B41EAEFAF4DA79A4E406160F56228A9`
- **Built:** 2026-09-06 08:53 from `425761e` (pushed to origin/main)
- **Path:** `C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.10\release\bundle\nsis\`

First build containing the Codex allowance connector.

### Acceptance checklist

1. **Dashboard shows a live percentage and countdown for ChatGPT/Codex.** This is the point
   of the release: the frozen dashboard was never changed, so this working proves the
   adapter contract holds. Cross-check the figure against `/status` in the Codex TUI.
2. **Sources shows the ChatGPT/Codex allowance card** with both windows, the plan, and a
   notice if a rate-limit reset is available while blocked.
3. Chart pop-out renders content; its X closes it.
4. Hovering the tray icon shows the panel near the icon; it stays open when the pointer
   moves into it; it is semi-transparent.
5. `%APPDATA%\com.aiusagemeter.desktop\logs\` stays small. Tens of MB means the save loop
   has regressed.
6. **No console window flashes** during a refresh. If one does, `CREATE_NO_WINDOW` is not
   taking effect.
7. Settings > Providers accepts an Anthropic Personal key with Organization scope and
   reports "Configured"; Sources then shows token/cost figures, or a clear error.

Items 1, 2 and 6 are new in 0.1.10. The API connectors remain unverified against a real key.
