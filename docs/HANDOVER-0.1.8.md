# AI Usage Meter — Handover 0.1.8

**Date:** 2026-09-05 · **Head:** `b7fdb8f` on `main` (pushed) · **Installer built from:** `5dd5627`
**Repo:** https://github.com/walladanger/AI-Usage-Meter
**Local:** `C:\Users\Warwick\.codex\.chatgpt-projects\g-p-6a98b8cd6fa0819194212d5d3efb7f5c\AI-Usage-Meter-work`

---

## Continuation prompt (paste this to start the next session)

> Continue AI Usage Meter from `main` (`b7fdb8f`). Read `docs/HANDOVER-0.1.8.md` and
> `docs/provider-capability-matrix.md` completely before doing anything.
>
> Current version is 0.1.8. The **Codex app-server test in §6 has been run and PASSED** —
> it returned real allowance data on codex-cli 0.148.0-alpha.9. Priority one is now to
> build that connector (§6, Step 4). Do not describe any other connector as working until
> it has returned real data from a real account.

---

## 1. Where the project actually stands

| Area | State |
|---|---|
| Settings-save loop | **Fixed and regression-tested** |
| Chart pop-out / X button | Should now work — **needs physical acceptance** |
| Tray hover panel | Implemented — **needs physical acceptance** |
| OpenAI connector | Implemented — **never called with a real key** |
| Anthropic connector | Implemented, cents bug fixed — **never called with a real key**. Needs a Personal key with Organization scope; workspace keys are rejected. |
| Gemini connector | **Not implemented.** Proven to have no usage endpoint. |
| Codex allowance connector | **Not implemented, but the source is VERIFIED WORKING** — see §6. |
| Dashboard display of API usage | **Not done** — `Dashboard.tsx` is frozen. Figures show on Sources. |

**Tests: 158 frontend (45 files), 29 Rust.** All passing.

### Installer

- `AI Usage Meter_0.1.8_x64-setup.exe` — 4,569,026 bytes
- SHA-256 `4032147FE663DD87990BECCD299228D452C803E2770030C992EF7F9EC6BF86C4`
- `C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.8\release\bundle\nsis\`

Supersedes 0.1.7, whose Anthropic costs were 100× too high.

---

## 2. Security constraints (IMMUTABLE)

1. No cloud backend, telemetry, automated login, password capture, cookies, prompts,
   conversations, provider-page contents, or browsing history.
2. Secrets go in **Windows Credential Manager** — never SQLite, settings, source, Git, or logs.
3. Never log credentials, tokens, prompts, conversations, provider HTML, allowance values,
   or reset timestamps.
4. Logs stay local unless the user copies them.
5. Loopback session token: fresh per launch, never written to disk.

**Design rule that enforces this:** `credentials::read` is `pub(crate)`. There is deliberately
no Tauri command that returns a stored key. The frontend only ever sees
`{ configured, hint }` where `hint` is a masked tail.

---

## 3. Build and test

```powershell
# Frontend tests
npm test

# Rust tests — CARGO_TARGET_DIR must be OUTSIDE .codex
# (Windows Application Control blocks test executables in hidden folders)
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.8'
cargo test --manifest-path src-tauri/Cargo.toml

# Installer for the next release (bump version FIRST)
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.9'
npm run tauri:build -- --bundles nsis
```

**Four version files must match:** `package.json`, `package-lock.json` (top level **and**
`packages."".version`), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
Current: **0.1.9**. Next release: **0.1.10**.

Run `cargo fmt` before committing Rust or the format check fails.

---

## 4. Acceptance checklist for 0.1.8

Do this before writing new code.

1. **Chart pop-out renders content** and its X button closes it.
2. **Hover the tray icon** — panel appears near the icon, semi-transparent, and stays open
   when the pointer moves into it.
3. **Log stays small.** `%APPDATA%\com.aiusagemeter.desktop\logs\`. A few KB is healthy;
   tens of MB means the save loop regressed — see §7.
4. **Settings → Providers** accepts an admin key and reports "Configured · ****abcd".
5. **Sources page** shows real token/cost figures after a refresh, or a clear error.

---

## 5. Architecture essentials

### Windows

| Window | Label | URL | Notes |
|---|---|---|---|
| Main | `main` | `index.html` | 960×640 min; close hides to tray |
| Tray panel | `tray-panel` | `index.html?window=external&feature=tray-panel` | 380×440, **transparent** |
| Chart pop-out | `ai-usage-meter-feature-usage-trend` | `index.html?window=external&feature=usage-trend` | 980×640 min |

Routing uses query params plus an init script; `selectExternalFeature()` takes whichever
fires first and returns a reference into the frozen `windowRegistry` (stable across renders —
this matters, see §7). CSS min-width is gated to `html:not(.ai-external-window)`; the tray
panel also carries `html.ai-tray-panel` so it can opt out of the opaque background.

### Data flow

```
App.tsx
  └─ UsageController(fixtureProviders, [])
       └─ startup: read credential status → setAdapters(createApiAdapters(configured))
       └─ scheduled refresh honours settings.usage.refreshMinutes
```

Providers without a stored key stay on fixture/manual data.

### Key files

| Purpose | File |
|---|---|
| Credential store | `src-tauri/src/credentials.rs` |
| Provider HTTP + parsing | `src-tauri/src/providers.rs` |
| Tauri commands | `src-tauri/src/lib.rs` |
| Tray hover logic | `src-tauri/src/tray.rs` |
| Frontend credential boundary | `src/settings/providerCredentialsService.ts` |
| Frontend adapter | `src/usage/apiProviderAdapter.ts` |
| Settings UI | `src/features/settings/ProvidersSettingsCard.tsx` |
| Returned-usage display | `src/features/sources/ApiUsageSummary.tsx` |
| **The loop fix** | `src/windows/windowState.ts` |

### Frozen — do not touch without explicit approval

`src/features/dashboard/Dashboard.tsx`, its test, and `dashboard.css`.
Reference image: `docs/screenshots/ai-usage-meter-dashboard-approved.png`.

---

## 6. THE CODEX TEST — RUN 2026-09-05, PASSED

### Why this matters more than anything else

No provider offers a REST API for **subscription allowance**. That is the app's headline
question. But the Codex CLI ships a local **app-server** whose JSON-RPC interface returns
exactly the fields the dashboard was designed around:

```json
{ "method": "account/rateLimits/read", "id": 6 }

{ "id": 6, "result": {
  "rateLimits": {
    "limitId": "codex",
    "limitName": null,
    "primary": { "usedPercent": 25, "windowDurationMins": 15, "resetsAt": 1730947200 },
    "secondary": null,
    "rateLimitReachedType": null
  },
  "rateLimitsByLimitId": {
    "codex":       { "primary": { "usedPercent": 25, "windowDurationMins": 15, "resetsAt": 1730947200 } },
    "codex_other": { "primary": { "usedPercent": 42, "windowDurationMins": 60, "resetsAt": 1730950800 } }
  },
  "rateLimitResetCredits": { "availableCount": 2, "credits": [ ... ] }
} }
```

Documented field semantics:

| Field | Meaning |
|---|---|
| `usedPercent` | usage within the quota window → **remaining = 100 − usedPercent** |
| `windowDurationMins` | quota window length |
| `resetsAt` | **Unix timestamp (seconds)** of next reset |
| `planType` | ChatGPT plan for the bucket, when returned |
| `credits` | remaining workspace credit details, when returned |
| `rateLimitsByLimitId` | multi-bucket view keyed by metered `limit_id` |

Related methods on the same interface:

- `account/rateLimits/updated` — **push notification** whenever limits change (no polling)
- `account/usage/read` — ChatGPT token activity: `lifetimeTokens`, `peakDailyTokens`,
  `currentStreakDays`, plus optional daily buckets
- `account/rateLimitResetCredit/consume` — consume an earned reset

This satisfies original prompt §4 ("Codex CLI status may be usable as a local source if
officially supported and reliably machine-readable") and breaks **no** security constraint:
a local process, using the existing Codex login. No scraping, no auth bypass, no stored
password.

### Protocol facts (from the Codex docs)

- Command: **`codex app-server`** (stdio), or `codex app-server --listen ws://127.0.0.1:4500`
  for WebSocket mode.
- WebSocket mode expects `Authorization: Bearer <token>` where the token is in
  **`~/.codex/app-server-token`**.
- JSON-RPC 2.0, **but the `"jsonrpc":"2.0"` field is omitted on the wire.**
- An **`initialize` handshake is required first**, with `clientInfo`.
- Some methods need `capabilities.experimentalApi: true`; sending an experimental method
  without opting in returns `<descriptor> requires experimentalApi capability`.
- Open source: `openai/codex/codex-rs/app-server` — read it if the docs are ambiguous.

### RESULT — it works

Verified 2026-09-05. `initialize` then `account/rateLimits/read` returned live allowance
data: `usedPercent`, `windowDurationMins` and `resetsAt` for both a 5-hour primary window
and a weekly secondary window, plus `planType`, a `credits` object, and available
rate-limit reset credits.

**Two findings that are not in the published docs — see Addendum 2 of the capability
matrix for full detail:**

1. **The reply is async; stdin must stay open.** Closing the pipe after writing both
   messages returns only the `initialize` result, because the process exits on EOF before
   the reply is produced. This is indistinguishable from "the method doesn't exist".
2. **The payload is richer than documented** — `secondary` window, `credits`
   (`hasCredits` / `unlimited` / `balance`), `individualLimit`, `spendControlReached`,
   and `planType` per bucket.

Use `codex app-server generate-json-schema --out <DIR>` to confirm the method surface for
any given CLI version before trusting a method name. This is an alpha, experimental
interface and it will drift.

### Step 1 — the CLI (resolved)

Binary: `C:\Users\Warwick\.codex\.sandbox-bin\codex.exe` — **not on PATH**, so a connector
must locate it rather than assume `codex` resolves. Version at time of test:
`codex-cli 0.148.0-alpha.9`. To re-locate:

```powershell
Get-Command codex -ErrorAction SilentlyContinue
Get-ChildItem "$env:APPDATA\npm" -Filter "codex*"
Get-ChildItem "$env:LOCALAPPDATA\Programs" -Filter "*codex*"
codex --version    # record this; the JSON-RPC surface may vary by version
```

**Record the version.** If this connector ships, it must state which CLI versions it was
verified against.

### Step 2 — the call that works

```bash
CODEX="/c/Users/Warwick/.codex/.sandbox-bin/codex.exe"
{ printf '%s
' '{"method":"initialize","id":0,"params":{"clientInfo":{"name":"ai_usage_meter","title":"AI Usage Meter","version":"0.1.8"},"capabilities":{"experimentalApi":true}}}'
  sleep 2
  printf '%s
' '{"method":"account/rateLimits/read","id":1}'
  sleep 18
} | timeout 40 "$CODEX" app-server
```

The trailing `sleep` is load-bearing — without it the process exits before replying.

If stdio is awkward, use WebSocket mode instead:

```powershell
codex app-server --listen ws://127.0.0.1:4500
# then connect with the bearer token from ~/.codex/app-server-token
```

### Step 3 — what to record

1. Does `initialize` return a result, or an error?
2. Does `account/rateLimits/read` return **real** `usedPercent` / `resetsAt` values?
3. Are the numbers plausible against what `/status` or `/usage` shows in the Codex TUI?
4. Is `planType` present? Is `credits` present?
5. Which `limitId` buckets exist for this account?
6. Does the process stay alive so `account/rateLimits/updated` can push, or does it exit?

**Capture the raw response** (redact nothing — it contains no secrets, only usage figures —
but do **not** commit it, per constraint 3 on logging allowance values).

### Step 4 — only if it works

Implementation sketch, not a commitment:

- New Rust module `src-tauri/src/codex.rs`: spawn `codex app-server`, do the handshake,
  call `account/rateLimits/read`, map to `UsageObservation`.
- This is the **first** source that can legitimately populate `remainingPercent` and
  `resetAt` — every existing connector deliberately leaves them undefined.
- `sourceType` needs a `'cli'` variant (already in the `SourceType` union, unused).
- Source label for prompt §20 transparency: `codex_cli`.
- Prefer subscribing to `account/rateLimits/updated` over polling.
- Handle the CLI being absent, logged out, or a version with a different surface — all
  three must degrade to manual entry, not error the app.

### If it does not work

Say so plainly and update `docs/provider-capability-matrix.md`: move the OpenAI
subscription-allowance row back to NOT AVAILABLE and record *why*. Do not leave the
PARTIAL rating standing on an unverified claim.

---

## 7. Pitfalls

| Pitfall | Avoidance |
|---|---|
| **React effects that write settings** | Never depend on `load`/`save` from `useWindowStateSettings` — hold them in refs. This caused 0.1.6's 148 writes/second. Any new effect that writes settings needs stable deps. |
| `cargo test` in a hidden folder | Set `CARGO_TARGET_DIR` outside `.codex` |
| `cargo fmt --check` failures | Run `cargo fmt` before committing |
| Four version files | Check all four every release |
| Committing API keys | `git diff --staged` before every commit |
| Python heredocs with Windows paths | Use raw strings (`r"""..."""`) or `\U` in `C:\Users\...` throws a unicode escape error |
| Claiming a connector works | It has not returned real data until you have seen real data |

---

## 8. Remaining work, ranked

### P0 — Verify
1. **The Codex test** (§6).
2. Physical acceptance of 0.1.8 (§4).
3. A real admin key end to end for OpenAI and/or Anthropic. Note Anthropic's Admin API is
   **unavailable to individual accounts** — a personal Pro/Max subscription cannot use it.

### P1 — Cheap correctness wins (documented, not built)
- **Monthly spend cap as a denominator.** OpenAI publishes per-tier monthly limits
  (Free/T1 $100, T2 $500, T3 $1,000, T4 $5,000, T5 $200,000). Combined with the Costs API
  this yields "$6.72 / $500 · resets in 26 days" — a real percentage from data already
  fetched. Tier is a one-time manual selection. **Highest value-to-effort item.**
- **`Retry-After` and `error.code`.** We honour neither and have no retry logic; all 5xx
  collapse to "API unavailable". OpenAI distinguishes `429`+`slow_down` from
  `503`+`server_is_overloaded`.
- **`testConnection()`** — original prompt §22 specified it; never built. `GET /v1/models`
  is free and validates a key instantly. Gemini equivalent: `GET v1beta/models`.
- **`OpenAI-Organization` / `OpenAI-Project` headers.** If the user belongs to multiple
  orgs, usage may be attributed to the wrong one. We send neither.
- **Log `x-request-id`.** Non-secret, OpenAI recommends it, fits the existing diagnostics.

### P2 — Dashboard
`ApiUsageMetrics` reaches the frontend but the Dashboard shows `—` for an API-connected
provider, because an API observation has no `remainingPercent`. Deciding what that card
should display needs approval — `Dashboard.tsx` is frozen.

### P3 — Larger
- Gemini via Cloud Monitoring time-series + OAuth (heavy; no single endpoint exists).
- Persist `apiUsage` — `tauriSqlUsageRepository` drops it; needs a schema migration to feed
  the history charts.
- Browser extension, notifications, export — unchanged from 0.1.6.

---

## 9. Research sources

Provider documentation is retrievable in bulk, which is how the three corrections in the
capability matrix were found:

```bash
curl -L -o anthropic.md https://platform.claude.com/llms-full.txt        # ~40 MB
curl -L -o codex.md     https://developers.openai.com/codex/llms-full.txt # ~1.7 MB — the Codex surface
curl -L -o openai.md    https://developers.openai.com/api/llms-full.txt   # ~4 MB
curl -L -o gemini.json  'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta'
```

Grepping these found what targeted web searches missed — including the Codex app-server
interface and the Anthropic cents bug. `llms.txt` (without `-full`) is the table of contents.

---

## 10. Outstanding non-code task

The user's standing convention mirrors pushed work to
`D:\CLAUDE and CLUADE CODE and DESKTOP OUTPUT\Projects\<repo>\`. **`D:` was not mounted**
when 0.1.8 was pushed, so that mirror was not made. `5dd5627` is confirmed on origin/main,
so the mirror is safe to create, and `Projects\README.md` should record that commit.
