# Provider Capability Matrix

**Researched:** 2026-09-05 · **For version:** 0.1.7 · Required by original prompt §24 (verify before implementing).

Every row below was checked against current official documentation on the date above. Where an
official programmatic source does not exist, the row says so instead of guessing. No endpoint in
this document was invented; each supported row carries the exact URL used by the implementation.

---

## 1. The distinction that governs this whole app

The original prompt (§2) warned: **do not assume API usage represents subscription usage.** Research
confirms this is the single most important constraint on the project:

| | What it is | Official API? |
|---|---|---|
| **Subscription allowance** | ChatGPT Plus/Pro, Codex plan limits, Claude Pro/Max, Claude Code, Gemini app | **No REST API from any provider.** OpenAI exposes it *locally* via the Codex CLI app-server — see Addendum, Correction 1. |
| **Organization API usage/cost** | Pay-as-you-go API keys billed per token | **Yes — OpenAI and Anthropic. Partial for Google.** |

**Consequence:** the headline question "how much ChatGPT/Claude/Gemini subscription usage do I have
left?" **cannot be answered by any provider's REST API today.** For Claude and Gemini it comes only
from manual entry (prompt §19). For ChatGPT/Codex there is a documented **local** source — the Codex
CLI app-server — recorded in Addendum Correction 1 and **not yet verified**. The connectors
implemented in 0.1.7 answer the *API spend and token* questions, which are real and documented.

This is a limitation of the providers, not of this application. It must never be papered over with
invented values.

---

## 2. Matrix

Legend: **SUPPORTED** · **PARTIAL** · **NOT AVAILABLE** · **MANUAL FALLBACK**

| Metric | OpenAI | Anthropic | Gemini |
|---|---|---|---|
| API token usage | **SUPPORTED** [1] | **SUPPORTED** [4] | **PARTIAL** [7] |
| API cost | **SUPPORTED** [2] | **SUPPORTED** [5] | **PARTIAL** [8] |
| Prepaid credit balance | **NOT AVAILABLE** | **NOT AVAILABLE** | **NOT AVAILABLE** |
| Subscription allowance | **SUPPORTED (VERIFIED)** — Codex CLI app-server, local JSON-RPC. Returned real data 2026-09-05 on codex-cli 0.148.0-alpha.9. See Addendum Correction 1. | **NOT AVAILABLE** → MANUAL FALLBACK [6] | **NOT AVAILABLE** → MANUAL FALLBACK |
| Reset time | **SUPPORTED (VERIFIED)** — `resetsAt` (unix seconds) per bucket via the Codex app-server | **NOT AVAILABLE** → MANUAL FALLBACK | **NOT AVAILABLE** → MANUAL FALLBACK |
| Model-level usage | **SUPPORTED** (`group_by=model`) [1] | **SUPPORTED** (`group_by[]=model`) [4] | **PARTIAL** [7] |
| Rate limits | **PARTIAL** — `x-ratelimit-*` response headers (see Addendum) | **SUPPORTED** (Rate Limits API) [9] | **PARTIAL** (quota metrics) [7] |
| Official API? | Yes | Yes | Only via Cloud Monitoring / Billing |
| Authentication required | **Admin key** [1] | Admin key **or any non-workspace-scoped personal/service key** [4] | GCP OAuth / service account [7] |

---

## 3. Hard gating facts (read before assuming a connector will work)

1. **Anthropic's Admin API is unavailable for individual accounts.** The docs state this
   explicitly: the account must be an organization (Console → Settings → Organization). A personal
   Claude Pro/Max subscription alone **cannot** use the usage/cost endpoints. [4]
2. **Anthropic: it is the key's SCOPE that matters, not its prefix.** The usage/cost sections state
   three times: "You can access them using an Admin API key, an OAuth token with the `org:admin`
   scope, **or a personal or service account key that isn't scoped to a workspace**; workspace API
   keys don't work." So an ordinary `sk-ant-api03-` **personal key with Organization scope works**;
   a `sk-ant-api03-` **workspace-scoped** key does not. Do not tell users they need
   `sk-ant-admin01-` specifically. OpenAI does require an admin key from
   Settings → Organization → Admin keys.
3. **Claude Enterprise (claude.ai) uses a different API** (Analytics API key), not the Admin API. [4]
4. **Anthropic recommends polling at most once per minute.** The 5-minute default is safe. [4]
   **These reporting endpoints are not billed per call.** Anthropic bills for inference tokens;
   `usage_report` and `cost_report` run no model. No statement to the contrary exists anywhere in
   the documentation. The binding constraint is the rate limit, not cost.
5. **Gemini has no equivalent single endpoint.** Usage must be derived from Cloud Monitoring
   time-series, requiring a GCP project with the Monitoring API enabled plus OAuth/service-account
   credentials — a materially heavier setup than an API key. [7]

---

## 4. Endpoints used by the implementation

### OpenAI — usage

```
GET https://api.openai.com/v1/organization/usage/completions
Authorization: Bearer <ADMIN_KEY>
?start_time=<unix>&end_time=<unix>&bucket_width=1d&limit=<n>
```

Response: `{ data: [ { object: "bucket", start_time, end_time, results: [ { input_tokens,
output_tokens, input_cached_tokens, num_model_requests, model, ... } ] } ], has_more, next_page }` [1]

### OpenAI — cost

```
GET https://api.openai.com/v1/organization/costs
Authorization: Bearer <ADMIN_KEY>
?start_time=<unix>&bucket_width=1d&limit=<n>
```

Response results: `{ object: "organization.costs.result", amount: { value: <float>,
currency: "usd" }, line_item, project_id }` [2]

### Anthropic — usage

```
GET https://api.anthropic.com/v1/organizations/usage_report/messages
x-api-key: <ADMIN_KEY>
anthropic-version: 2023-06-01
?starting_at=<ISO8601>&ending_at=<ISO8601>&bucket_width=1d&limit=<n>
```

Buckets carry uncached input, cached input, cache-creation, and output token counts.
Granularity caps: `1m` ≤ 1440, `1h` ≤ 168, `1d` ≤ 31 buckets. [4]

### Anthropic — cost

```
GET https://api.anthropic.com/v1/organizations/cost_report
x-api-key: <ADMIN_KEY>
anthropic-version: 2023-06-01
?starting_at=<ISO8601>&ending_at=<ISO8601>
```

**Amounts are decimal strings in CENTS — parse as decimal, then divide by 100.** `"123.45"` in
`"USD"` represents `$1.23`. Daily (`1d`) only. Priority Tier costs are excluded from this
endpoint. [5] (Corrected in 0.1.8; 0.1.7 reported these 100x too high.)

Both Anthropic endpoints paginate with `has_more` / `next_page`. [4]

### Gemini — not implemented as an automatic connector in 0.1.7

Would require `monitoring.googleapis.com/v3/projects/{id}/timeSeries` filtered on
`serviceruntime.googleapis.com/quota/allocation/usage` or `.../api/request_count` with
`resource.type="consumer_quota"`, plus OAuth. Deferred; Gemini uses manual entry until this is
built and verified against a real project. [7]

---

## 5. Verification status

**No connector in this repository may be described as "working" until it has returned real data
from a real account.**

| Connector | Implemented | Verified against a real account |
|---|---|---|
| OpenAI usage + cost | Yes (0.1.7) | **NOT YET — needs a real admin key** |
| Anthropic usage + cost | Yes (0.1.7); cent conversion fixed in 0.1.8 | **NOT YET — needs a real admin key + org account** |
| Gemini | No | n/a |
| Manual entry | Yes | Yes |

---

## References

[1] OpenAI Usage API — https://developers.openai.com/cookbook/examples/completions_usage_api and https://platform.openai.com/docs/api-reference/usage

[2] OpenAI Costs API — https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs

[3] Using Codex with your ChatGPT plan — https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan (limits shown in the Codex dashboard and CLI `/status`; no public REST endpoint)

[4] Anthropic Usage and Cost API — https://platform.claude.com/docs/en/manage-claude/usage-cost-api

[5] Anthropic Cost API reference — https://platform.claude.com/docs/en/api/admin-api/usage-cost/get-cost-report

[6] Anthropic Admin API — https://platform.claude.com/docs/en/manage-claude/admin-api

[7] Chart and monitor quota metrics (Cloud Monitoring) — https://docs.cloud.google.com/monitoring/alerts/using-quota-metrics and https://docs.cloud.google.com/apis/docs/monitoring

[8] Google Cloud Billing export — https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery (detailed history requires BigQuery export; optional per prompt §6)

[9] Anthropic Rate Limits API — https://platform.claude.com/docs/en/manage-claude/rate-limits-api

---

# Addendum — 2026-09-05, second research pass

Sourced from the providers' own complete documentation exports and machine-readable API
specs, not from prose summaries. **Three entries above are corrected by this addendum.**

## How to re-fetch these sources (one command each)

```bash
curl -L -o anthropic-full.md https://platform.claude.com/llms-full.txt      # ~42 MB, all Anthropic docs
curl -L -o openai-full.md    https://developers.openai.com/llms-full.txt    # ~6.7 MB, all OpenAI docs
curl -L -o codex-full.md     https://developers.openai.com/codex/llms-full.txt  # ~1.8 MB, Codex docs
curl -L -o gemini-api.json   'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta'
curl -L -o monitoring.json   'https://monitoring.googleapis.com/$discovery/rest?version=v3'
curl -L -o billing.json      'https://cloudbilling.googleapis.com/$discovery/rest?version=v1'
```

`llms.txt` (without `-full`) is the table of contents. Any doc page also serves Markdown by
appending `.md` to its URL. Google publishes no `llms.txt`; its Discovery Documents are the
authoritative endpoint list.

---

## CORRECTION 1 — OpenAI subscription allowance is available locally (was NOT AVAILABLE)

The matrix said no provider exposes subscription allowance. That is **wrong for OpenAI**. It is
absent from the REST API, but the **Codex CLI app-server** exposes it over local JSON-RPC.

```json
{ "method": "account/rateLimits/read", "id": 6 }
{ "id": 6, "result": {
  "rateLimits": {
    "limitId": "codex",
    "primary": { "usedPercent": 25, "windowDurationMins": 15, "resetsAt": 1730947200 },
    "secondary": null,
    "rateLimitReachedType": null
  },
  "rateLimitsByLimitId": { "codex": { ... }, "codex_other": { ... } },
  "rateLimitResetCredits": { "availableCount": 2, "credits": [ ... ] }
} }
```

Documented field semantics:
* `usedPercent` — usage within the quota window (**remaining = 100 − usedPercent**)
* `windowDurationMins` — quota window length
* `resetsAt` — **Unix timestamp (seconds) of the next reset**
* `planType` — the ChatGPT plan for the bucket, when returned
* `credits` — remaining workspace credit details, when returned
* `rateLimitsByLimitId` — multi-bucket view keyed by metered `limit_id`

Related methods on the same interface:
* `account/rateLimits/updated` — **push notification** emitted whenever limits change
* `account/usage/read` — ChatGPT token-activity summary plus optional daily buckets
  (`lifetimeTokens`, `peakDailyTokens`, `currentStreakDays`, …)
* `account/rateLimitResetCredit/consume` — consume an earned reset

This satisfies prompt §4 ("Codex CLI status may be usable as a local source if officially
supported and reliably machine-readable") and breaks no security constraint: it is a local
process using the user's existing Codex login. No scraping, no auth bypass, no stored password.

**Status: NOT YET VERIFIED.** The interface is documented; it has not been run on this machine.
Version stability across Codex CLI releases is unknown. Verify before implementing:
1. Confirm the Codex CLI is installed and find its app-server invocation.
2. Start it and issue `account/rateLimits/read` over stdio JSON-RPC.
3. Confirm real numbers return, and record the CLI version they came from.

Source: `https://developers.openai.com/codex/llms-full.txt`

---

## CORRECTION 2 — Anthropic cost amounts are CENTS, not dollars

The self-contradictory wording is resolved by the API reference:

> "Cost amount in lowest currency units (e.g. cents) as a decimal string. For example
> `"123.45"` in `"USD"` represents `$1.23`."

> "**Amount fields are decimal strings in cents.** Currency amounts are returned as decimal
> strings such as `"41280.000000"` (which represents $412.80). To convert to dollars, parse as
> a decimal and divide by 100. Avoid binary floating-point parsing for values that may exceed
> several million dollars."

**Therefore: parse as decimal, then DIVIDE BY 100.**

`src-tauri/src/providers.rs` does **not** divide, so Anthropic costs are currently reported
**100× too high**. `costUnitUnverified` can be removed once the fix lands. Also note the
guidance against binary float parsing for large values — our `f64` path is acceptable for
personal-scale amounts but is not correct for very large ones.

Also discovered — a second Anthropic analytics surface not in the matrix above:
`/v1/organizations/analytics/{cost_report,usage_report,user_cost_report,user_usage_report,users}`
(per-user attribution; Claude Enterprise uses an Analytics API key rather than an Admin key).

---

## CORRECTION 3 — Gemini's absence is now PROVEN, not inferred

Enumerated every method in the Gemini Discovery Document
(`generativelanguage.googleapis.com`, v1beta): **48 methods, none for usage, quota, billing,
or limits.** All inference, files, tuning, caching, corpora. The earlier NOT AVAILABLE rating
was inferred from prose; it is now established from the authoritative machine-readable spec.

Confirmed fallbacks:
* Cloud Monitoring v3 — `GET v3/{+name}/timeSeries`, `POST v3/{+name}/timeSeries:query`
* Cloud Billing v1 — `GET v1/billingAccounts`, `GET v1/{+parent}/skus`, `GET v1/{+name}/billingInfo`

Both need a GCP project and OAuth/service-account credentials.

Minor win: `GET v1beta/models` authenticates with a plain API key and no OAuth scopes, so it
works as a free Gemini key-validation check.

---

## Other opportunities recorded (not yet acted on)

| Item | Value | Note |
|---|---|---|
| OpenAI rate-limit response headers | `x-ratelimit-remaining-tokens`, `-limit-tokens`, `-reset-tokens` (e.g. `6m0s`), plus project-scoped variants | Real remaining/reset, but only on **inference** responses. Whether admin usage endpoints return them is **undocumented — verify.** Mostly per-minute, so meaningful mainly for per-day (RPD/TPD) limits. Upgrades the OpenAI rate-limits row from NOT AVAILABLE to PARTIAL. |
| OpenAI monthly usage cap by tier | Free/T1 $100, T2 $500, T3 $1,000, T4 $5,000, T5 $200,000 | Gives the Costs API a **denominator**: "$6.72 / $500, resets in 26 days". Tier is a one-time manual selection. Highest value-to-effort item. |
| `Retry-After` + `error.code` | `429`+`slow_down` (ramping too fast) vs `503`+`server_is_overloaded` | We honour neither and have no retry logic; we lump all 5xx into "API unavailable". |
| `OpenAI-Organization` / `OpenAI-Project` headers | Correctness | If the user belongs to multiple orgs, usage may be attributed to the wrong one. We send neither. |
| `x-request-id` logging | Diagnostics | Non-secret; OpenAI recommends logging it. Fits the existing diagnostic log. |
| `GET /v1/models` | Free key validation | Enables the `testConnection()` from prompt §22, which was never built. |
| `GET /v1/fine_tuning/model_limits` | Minor | Documented GET that works with a **standard** (non-admin) key. |

Backwards-compatibility note: OpenAI documents "adding new properties to JSON response objects"
as a non-breaking change, which validates the tolerant field-matching used in `providers.rs`.


---

# Addendum 2 — 2026-09-05, Codex app-server VERIFIED

**Correction 1 of Addendum 1 is now verified against a real account.** This is the first
source in this project confirmed to return live data.

| | |
|---|---|
| Binary | `C:\Users\Warwick\.codex\.sandbox-bin\codex.exe` (not on PATH) |
| Version | `codex-cli 0.148.0-alpha.9` |
| Subcommand | `codex app-server` — marked `[experimental]` in `--help` |
| Result | `initialize` and `account/rateLimits/read` both returned successfully |

## Two things the prose docs did not tell us

### 1. The reply is asynchronous — stdin must stay open

Piping both messages and letting stdin close returns **only** the `initialize` result. The
process exits on EOF before the rate-limit reply is produced. This looks exactly like "the
method does not exist". Hold the pipe open:

```bash
{ printf '%s\n' '<initialize>'; sleep 2; printf '%s\n' '<rateLimits/read>'; sleep 18; } | codex app-server
```

Any connector must keep the child process alive, not fire-and-forget.

### 2. The response is richer than documented

The published example shows `primary`, `secondary`, `limitId`, `limitName` and
`rateLimitReachedType`. This build additionally returns, **per bucket**:

| Field | Type | Meaning |
|---|---|---|
| `secondary` | window object | A second window (weekly) alongside the 5-hour `primary` |
| `credits.hasCredits` | bool | Whether purchased credits exist |
| `credits.unlimited` | bool | Unlimited plan flag |
| `credits.balance` | string | Credit balance as a decimal string — parse as decimal |
| `individualLimit` | object/null | Per-individual limit within a workspace |
| `spendControlReached` | bool | Spend control triggered |
| `planType` | string | ChatGPT plan, e.g. `plus` |

Window objects carry `usedPercent`, `windowDurationMins`, `resetsAt` (unix seconds).
Observed windows: `300` mins (5-hour) as primary, `10080` mins (weekly) as secondary.

`rateLimitResetCredits` returns `availableCount` plus detail rows with `id`, `resetType`,
`status`, `grantedAt`, `expiresAt`, `title`, `description`.

## Method surface confirmed in this build

`codex app-server generate-json-schema --out <DIR>` emits the full protocol schema. This is
the authoritative check for a given CLI version. Confirmed present:

```
account/rateLimits/read          account/rateLimits/updated
account/usage/read               account/rateLimitResetCredit/consume
account/read                     account/updated
account/workspaceMessages/read   account/sendAddCreditsNudgeEmail
account/login/start              account/login/completed
account/login/cancel             account/logout
account/chatgptAuthTokens/refresh
```

**Run `generate-json-schema` before trusting any method name** — this is an experimental,
alpha-versioned surface and it will drift.

## Implementation notes

* Map `100 - usedPercent` to `remainingPercent`, `resetsAt` to `resetAt`, and
  `windowDurationMins` to `windowLabel`. This is the first source that may legitimately
  populate those fields; every API connector deliberately leaves them undefined.
* `sourceType: 'cli'` (already in the union, unused), source label `codex_cli`.
* Prefer subscribing to `account/rateLimits/updated` over polling.
* Degrade to manual entry — never error the app — when the CLI is absent, logged out, or a
  version whose surface differs.
* Per security constraint 3, allowance values and reset timestamps must **not** be written
  to the diagnostic log. Log the outcome state only, as the API connectors already do.
