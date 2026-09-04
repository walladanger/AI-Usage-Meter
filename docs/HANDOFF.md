# AI Usage Meter — Project Handover

**Handover date:** 2026-09-04

**Repository:** https://github.com/walladanger/AI-Usage-Meter

**Canonical branch:** `main`

**Verified application commit:** `fae5e47d538ff72274d39c324aa36b9106cd47e9` (`fix: render chart in production bundle`)
**Project version:** `0.1.0` unsigned Windows verification build

## 1. Read this first

AI Usage Meter is a new, standalone repository cloned from Ember Studio Foundation. The original Ember repository must remain untouched and is only a design/infrastructure reference.

The user is the product and design owner and has very little coding experience. Translate visual and behavioral requests into implementation details without requiring technical terminology from the user.

The highest-priority working rule is:

> Modify only the requested feature or the agreed plan. Do not redesign, rename, move, refactor, remove, or “clean up” unrelated working code.

Use GitHub `main` as the source of truth. Do not resume from the old local `feature/windows-verification-build` branch without first reconciling it with GitHub. That local branch contains equivalent changes under different commit SHAs because verified changes were published through the GitHub API. The safest continuation is a fresh clone of GitHub `main`, followed by a new focused feature branch.

## 2. Product goal

Build a local-first Windows 11 utility that shows, at a glance:

1. Personal-plan usage remaining for ChatGPT/Codex, Claude/Claude Code, and Gemini.
2. Which allowance is lowest.
3. Which allowance resets next.
4. When each allowance resets.
5. Whether each value is current, stale, disconnected, or manually entered.

Personal subscription allowances and API billing are separate products and data sources. Never imply that API usage represents ChatGPT, Claude, or Gemini consumer-plan usage.

- **Milestone 1:** personal subscriptions, local connectors, browser companion, manual fallback.
- **Milestone 2:** OpenAI, Anthropic, and Google API usage, tokens, costs, credits, and billing.

## 3. Approved design and non-negotiable UI decisions

The approved visual target is:

`docs/screenshots/ai-usage-meter-dashboard-approved.png`

GitHub: https://github.com/walladanger/AI-Usage-Meter/blob/main/docs/screenshots/ai-usage-meter-dashboard-approved.png

The selected dashboard direction is the revised “Image 1.” Preserve these decisions:

- Opaque smoky-black Ember-style Windows shell with restrained blue accents.
- Frameless, resizable application with custom title-bar controls.
- Sidebar collapse is a plain glyph at the top, not a boxed button.
- No redundant collapse button at the bottom of the sidebar.
- No top summary strip above the provider cards.
- Three equal provider cards for OpenAI, Claude, and Gemini.
- No recent-activity panel on the right.
- Seven-day usage chart spans the full available application width.
- Chart includes a real pop-out control using the existing native external-window system.
- Preserve Overview, Refresh, Alerts, History, Sources, Settings, and Help navigation.
- Do not change unrelated Ember shell behavior or styling.

The image in the repository is the approved design target, not proof of a successfully running Windows build. A real installed-app screenshot has not yet been captured.

## 4. Architecture

- React 19 + TypeScript + Vite frontend.
- Tauri 2 Windows desktop shell written in Rust.
- SQLite local history through the Tauri SQL plugin.
- Existing Ember native-window infrastructure for chart pop-outs.
- Tauri tray icon, compact tray panel, and Windows startup setting.
- Provider-neutral usage domain and adapters.
- Planned Manifest V3 Chromium extension for personal subscription data.
- Planned loopback-only ingestion service at `127.0.0.1:43127` with explicit pairing.
- No cloud backend, telemetry, automated login, password capture, cookie export, or browsing-history collection.
- Secrets must use Windows Credential Manager or another OS-backed abstraction. Never store secrets in SQLite, frontend persistence, logs, source, or Git.

## 5. Implemented work

The following is present on GitHub `main`:

- Separate AI Usage Meter identity and repository.
- Approved Command Center dashboard.
- OpenAI, Claude, and Gemini provider panels.
- Normalized provider-neutral allowance model and calculations.
- Manual allowance/reset entry with validation.
- Independent provider refresh handling using last-good-value preservation.
- SQLite schema, migration, repository boundary, and parameterized statements.
- Seven-day ECharts usage chart.
- Registered native chart pop-out window.
- Overview, Refresh, Alerts, History, Sources, Settings, and Help pages.
- Four-step guided setup flow.
- Alert threshold evaluation; notifications are disabled by default.
- Compact tray panel.
- Tauri system-tray menu with Dashboard, Refresh, Settings, and Exit.
- Close-to-tray behavior and explicit Windows startup preference.
- Startup diagnostics before and during frontend initialization.
- Readable startup recovery screen instead of an entirely blank window.
- GitHub CI, Windows native compile check, Windows installer artifact, CodeQL, and Dependabot.

Some screens currently use fixture/manual data because automatic personal-plan connectors have not been implemented.

## 6. Most recent failure and correction

### User-observed failure

The first Windows installer opened to a blank application. After startup diagnostics were added, the next build displayed:

`Minified React error #130 ... args[]=object`

### Root cause

`src/features/dashboard/UsageTrendChart.tsx` imported the CommonJS chart wrapper:

```ts
import ReactEChartsCore from 'echarts-for-react/lib/core';
```

The optimized production bundler wrapped that import so React received an object instead of a component. The existing unit test mocked the same CommonJS path and therefore hid the production-only problem.

### Applied correction

The chart now imports the package's ESM component:

```ts
import ReactEChartsCore from 'echarts-for-react/esm/core';
```

The dashboard test mock was updated to the ESM path. A production-bundle smoke test was added at `scripts/smoke-production-bundle.mjs`, exposed as:

```bash
npm run test:production-bundle
```

The smoke test imports the actual optimized Vite bundle in JSDOM and fails unless the real application renders `Command Center`. GitHub CI now runs this test after every frontend production build.

Do not remove this regression test or change the chart import back to `echarts-for-react/lib/core`.

## 7. Current verification evidence

Verification for commit `fae5e47d538ff72274d39c324aa36b9106cd47e9`:

- `npm test`: **38 test files passed; 118 tests passed**.
- `npm run build`: **passed** (TypeScript project build and optimized Vite build).
- `npm run test:production-bundle`: **passed; dashboard rendered**.
- GitHub Windows Tauri `cargo check`: **passed**.
- GitHub Windows NSIS installer build: **passed**.
- GitHub CodeQL run: **passed**.
- Git diff whitespace check before publishing: **passed**.

CI run: https://github.com/walladanger/AI-Usage-Meter/actions/runs/33825661696

CodeQL run: https://github.com/walladanger/AI-Usage-Meter/actions/runs/33825661693

Windows artifact:

- Name: `ai-usage-meter-windows-test-installer`
- Artifact ID: `9920100679`
- Download: https://github.com/walladanger/AI-Usage-Meter/actions/runs/33825661696/artifacts/9920100679
- SHA-256 reported by GitHub: `516987baf9caf9e595ec5a539ba9437c930540e6054e80a8cf8d10648b46375c`
- GitHub retention expiry: 2026-09-18

This is an unsigned verification installer. Windows SmartScreen may show an unknown-publisher warning.

## 8. Immediate next action

The corrected installer has passed automated and Windows compilation/package checks, but the user has not yet confirmed the corrected build on their physical Windows computer.

Before starting connector development, ask the user to:

1. Completely exit the earlier AI Usage Meter process, including its tray icon.
2. Download and extract artifact `9920100679`.
3. Run the `.exe` installer.
4. Confirm the dashboard—not the React error screen—appears.
5. Work through `docs/windows-test-checklist.md`, especially launch, resize, tray, chart pop-out, navigation, manual entry, persistence, startup preference, and uninstall.
6. Provide a screenshot of the real installed dashboard if possible.

Do not claim the Windows runtime is fully verified until the user completes this check. Automated evidence proves the optimized frontend renders and the Windows package compiles; it does not replace physical Windows interaction testing.

## 9. Diagnostics

Verbose startup logging is already implemented. The Windows log is:

`%LOCALAPPDATA%\com.aiusagemeter.desktop\logs\startup-diagnostics.log`

Native startup markers are written before the webview is displayed. Frontend bootstrap, module loading, rendering, uncaught browser errors, unhandled promise rejections, and React error-boundary failures are recorded. Logs must remain free of secrets, browser page contents, cookies, and tokens.

If the corrected build still fails, collect:

- Exact visible error text.
- Screenshot.
- The diagnostic log above.
- Windows version, display resolution, and scaling.
- The installer artifact/run number used.

Then reproduce the failure with the smallest focused test before changing production code.

## 10. Remaining Milestone 1 work

### Not implemented

1. Secure Rust loopback ingestion service.
2. Short-lived pairing code and long-lived OS-backed credential storage.
3. Strict origin, payload, provider, timestamp, percentage, label, and 16 KiB size validation.
4. Chromium Manifest V3 browser companion.
5. Provider-specific ChatGPT/Codex, Claude/Claude Code, and Gemini page parsers.
6. Sanitized parser fixtures and fail-closed `connector_update_required` behavior.
7. Real-account connector validation in Chrome and Edge.
8. Provider capability matrix using current official documentation.
9. Browser extension installation guide.
10. Privacy/security documentation for permissions, retained data, and endpoints.
11. Complete visual comparison at `1440x1024` against the approved design.
12. Complete physical Windows acceptance checklist.

### Partially implemented or requiring physical verification

- Tray behavior and compact panel: implemented and compiled; needs real Windows interaction verification.
- SQLite persistence: covered by frontend repository tests; needs installed-app restart verification.
- Chart pop-out: frontend/native routing tests pass; needs real Windows interaction verification.
- Windows startup preference: implemented and compiled; needs real startup verification.
- Notifications: threshold logic and UI exist; native notification behavior needs later verification.

### Deferred Milestone 2

- OpenAI organization Usage and Costs APIs.
- Anthropic organization usage/cost reporting.
- Gemini API and Google Cloud billing.
- API keys, secure provider credential setup, organization/project selection.
- Token, request, model, cached-token, credit, and spend history.
- Additional providers.

The user has or has had API keys for all three providers, but those must not be used until Milestone 2 and must never be requested in chat or committed to the repository.

## 11. Recommended continuation order

1. Receive and record the user's result from the corrected Windows installer.
2. Fix only any installation/runtime blocker revealed by that test.
3. Capture an actual installed-app screenshot after launch succeeds.
4. Complete the Windows acceptance checklist for the already-built foundation.
5. Start Milestone 1 Task 9: secure loopback pairing and validated ingestion.
6. Build the Chromium extension shell and pairing flow.
7. Implement one provider parser at a time: ChatGPT/Codex, Claude/Claude Code, then Gemini.
8. Research and document capability boundaries using current official sources before labeling any connector supported.
9. Test against accounts the user controls; mark untested connectors as implemented but unverified.
10. Finish privacy, installation, visual-QA, and release documentation.
11. Begin Milestone 2 API billing only after Milestone 1 is stable.

Use test-driven development for every bug fix and feature. Run the full test/build suite and the production-bundle smoke test before publishing another installer.

## 12. Key files

| Purpose | File |
|---|---|
| Approved product specification | `docs/superpowers/specs/2026-09-03-ai-usage-meter-design.md` |
| Milestone 1 implementation plan | `docs/superpowers/plans/2026-09-03-ai-usage-meter-milestone-1.md` |
| Approved dashboard image | `docs/screenshots/ai-usage-meter-dashboard-approved.png` |
| Windows test checklist | `docs/windows-test-checklist.md` |
| GitHub workflow | `.github/workflows/ci.yml` |
| Application composition | `src/app/App.tsx` |
| Dashboard | `src/features/dashboard/Dashboard.tsx` |
| Chart and corrected import | `src/features/dashboard/UsageTrendChart.tsx` |
| Production launch smoke test | `scripts/smoke-production-bundle.mjs` |
| Usage domain | `src/usage/usageTypes.ts`, `src/usage/usageMath.ts` |
| Usage state/controller | `src/usage/usageStore.tsx` |
| Manual adapter | `src/usage/manualUsageAdapter.ts` |
| SQLite adapter | `src/usage/tauriSqlUsageRepository.ts` |
| SQLite migration | `src-tauri/migrations/0001_usage.sql` |
| Tray implementation | `src-tauri/src/tray.rs`, `src/features/tray/TrayPanel.tsx` |
| Startup behavior | `src-tauri/src/startup.rs` |
| Native diagnostics | `src-tauri/src/diagnostics.rs` |
| Frontend diagnostics | `src/diagnostics/`, `src/main.tsx` |

## 13. Development and verification commands

Requirements: Node.js 20.19 or newer, npm, Rust stable, and Tauri 2 Windows prerequisites for native work.

```bash
npm ci
npm test
npm run build
npm run test:production-bundle
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build -- --bundles nsis
```

The current Linux workspace can verify React, TypeScript, Vite, and the optimized bundle. Use GitHub Actions or a properly configured Windows machine for the native Tauri and NSIS checks.

## 14. Scope and security guardrails

- Never invent provider APIs or allowance values.
- Never equate consumer subscriptions with API billing.
- Never scrape private account pages without explicit documented approval.
- Never automate provider login.
- Never collect passwords, cookies, conversations, prompts, or browsing history.
- Bind the future ingestion server only to `127.0.0.1`, never all interfaces.
- Require explicit pairing and strict input validation.
- Never log or store secrets.
- Keep notifications disabled by default.
- Preserve last good provider values during isolated connector failures and mark them stale.
- Do not automatically reset usage to 100% when a timer expires; wait for a confirmed observation.
- Do not introduce Lovable or Hugging Face into Milestone 1. They are not needed for this utility.
- Do not alter the approved dashboard or unrelated Ember foundation behavior without direct user approval.

## 15. Suggested opening message for the new chat

> Continue building AI Usage Meter from the handover at `docs/HANDOFF.md` in https://github.com/walladanger/AI-Usage-Meter. Treat GitHub `main` as the source of truth and preserve the approved dashboard. First confirm my result from corrected Windows artifact `9920100679`; do not begin connector work until any launch blocker is resolved. Then continue with the remaining Milestone 1 work in the documented order. Make only targeted changes, test them, and do not claim Windows behavior works without evidence.
