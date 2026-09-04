# AI Usage Meter — Complete Build Handover

**Date:** 2026-09-04

**Repository:** https://github.com/walladanger/AI-Usage-Meter

**Canonical branch:** `main`

**Prepared release:** `0.1.4`, Windows 11 x64, unsigned NSIS

**Installer:** `AI Usage Meter_0.1.4_x64-setup.exe`

**Size:** 3,320,009 bytes
**SHA-256:** `2BAE7ACE4DFB4EE0A06683C74A29361C04C20F06BE7EC72D0BA05A2D0D3A9193`

## Read this first

Read this document completely before changing anything. GitHub `main` is the source of truth; make a focused branch from current main. The approved dashboard is frozen. Do not edit `src/features/dashboard/Dashboard.tsx`, `Dashboard.test.tsx`, or `dashboard.css` without direct user approval. Its reference image is `docs/screenshots/ai-usage-meter-dashboard-approved.png`.

Version every shipped iteration. This release is 0.1.4, so the next must be at least 0.1.5. Synchronize `package.json`, both root application entries in `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

Manual Entry is the only implemented provider source in 0.1.4. Never claim automatic provider connectivity. The Browser Companion, loopback server, pairing, extension, and provider parsers are not implemented.

## Product and design contract

AI Usage Meter is a local-first Windows utility intended to show remaining personal subscription allowance, reset timing, freshness, lowest allowance, and next reset for ChatGPT/Codex, Claude/Claude Code, and Gemini. Consumer subscription allowance and API organization billing are separate. Never substitute one for the other.

Preserve the smoky-black Ember-derived frameless shell, restrained blue accents, sidebar, three equal provider cards, full-width seven-day chart, chart pop-out, navigation, tray, and custom title controls. Do not add the removed summary strip or right-side activity panel.

No cloud backend, telemetry, automated login, password capture, cookies, prompts, conversations, provider-page contents, or browsing history is approved. Future secrets belong in Windows Credential Manager or another OS-backed store, never SQLite, frontend settings, source, Git, or logs.

## Stack and build environment

- React 19, TypeScript 7, Vite 8, Vitest 4, Testing Library/JSDOM.
- Tauri 2.11, Rust 2021, SQLite through Tauri SQL, tray-icon and autostart plugins.
- `time` 0.3 for local daily diagnostics.
- ECharts through `echarts-for-react/esm/core`. The CommonJS import previously caused a production-only blank window; do not restore it.
- NSIS Windows installer.
- Node 20.19+, npm, stable Rust, Microsoft C++ Build Tools, WebView2, and Tauri Windows prerequisites.

Windows Application Control on this machine blocks generated Rust test executables below hidden `.codex`. Always use an external target, e.g. `$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.5'`.

## 0.1.4 report, diagnosis, and correction

The user reported hover-only controls, Refresh with no apparent action, inert custom window controls, a blank-white chart pop-out, Sources freezing after Continue, no working provider connection, undiscoverable diagnostics, and version metadata stuck at 0.1.0.

Multiple faults were isolated:

1. Native-runtime detection used fragile markers. Runtime selection is now centralized on Tauri's supported detection, restoring native window commands.
2. Refresh lacked useful completion feedback. The refresh flow reports outcomes while retaining last-known provider values.
3. Dynamic windows passed `index.html?window=external&feature=...` as a Tauri application path. Packaged resolution could produce an empty webview. Rust now loads exact `index.html` and injects a validated, non-writable `window.__AI_USAGE_METER_EXTERNAL_FEATURE__` before frontend modules run. Static/browser query routing remains supported.
4. Sources falsely presented Browser Companion as available, although all automatic connector infrastructure is absent. Setup now defaults to Manual Entry, marks Browser Companion “Not installed yet” and disables it, shows `Saving…`, and fails visibly after five seconds rather than hanging indefinitely.
5. The legacy logger wrote sparse events to one `startup-diagnostics.log`. Rust now owns daily rotation and safe read/list APIs, and Settings includes a log viewer.

## Diagnostics: exact behavior

Daily logs are `%APPDATA%\com.aiusagemeter.desktop\logs\ai-usage-meter-YYYY-MM-DD.log`. Each launch records version and PID before later setup events. Sanitized native/frontend events cover bootstrap, window creation/failure, Settings persistence, and setup actions.

Retention is today plus the preceding 13 local calendar days. Pruning accepts only the exact daily filename pattern and never deletes unknown files or the legacy `startup-diagnostics.log`. Settings lists newest first and reads only a validated filename. Reads are capped at the newest 512 KiB and disclose truncation. The viewer refreshes, selects, displays, and copies only visible bounded text. Async generation guards prevent late responses from replacing newer selections.

Never log credentials, cookies, tokens, passwords, prompts, conversations, browsing history, provider HTML, allowance values, or reset timestamps. Logs remain local unless the user explicitly copies/uploads them.

Relevant files: `src-tauri/src/diagnostics.rs`, `src-tauri/src/lib.rs`, `src/diagnostics/diagnosticLogService.ts`, `src/diagnostics/appDiagnostics.ts`, `src/diagnostics/runtimeDiagnostics.ts`, `src/main.tsx`, and `src/features/settings/DiagnosticsSettingsCard.tsx`.

## Provider/source truth

Manual Entry and local persistence exist. The Rust loopback ingestion service, short-lived pairing, OS-backed pairing secret, Manifest V3 extension, ChatGPT/Codex parser, Claude parser, Gemini parser, sanitized parser fixtures, fail-closed update detection, and real-account Chrome/Edge validation do not exist.

`SourcesPage.tsx` must say this honestly. `SetupFlow.tsx` defaults to `manual`. A legacy `browser_extension` draft must be changed to Manual Entry before completion. `src/runtime/withTimeout.ts` supplies the five-second persistence boundary.

## Window architecture

External features are registered in `src/windows/windowRegistry.ts`. `open_external_feature_window` validates feature ID and label, creates plain `index.html`, injects its feature ID in the initialization script, and records sanitized lifecycle events. React resolves that identity before mounting the main shell. Unknown or internal-only features must fail closed. Native controls go through `src/windows/nativeWindowService.ts`; browser tests use safe adapters.

## Verification evidence

Completed locally on Windows 11 on 2026-09-04:

- `npm test`: 40 files and 124 tests passed.
- `npm run build`: TypeScript and optimized Vite bundle passed.
- `npm run test:production-bundle`: optimized bundle rendered Command Center.
- Rust formatting passed.
- `cargo test`: five native tests passed.
- `cargo check`: passed.
- Dashboard diff against approved commit `2850703d2f4be6e667af12637ce13f21db68ee18`: no content difference (line-ending warnings only).
- NSIS build passed.
- Release executable: 13,424,128 bytes; ProductVersion/FileVersion 0.1.4.
- Installer: 3,320,009 bytes; ProductVersion/FileVersion 0.1.4; SHA-256 shown above.
- A controlled five-second launch of only the new release executable appended the 0.1.4 version/PID, native setup, frontend module load, and React render to today's daily log. Only the process created by that check was stopped.

Automated checks do not prove mouse interaction. The separately installed 0.1.3 process was not terminated or overwritten. The user must install 0.1.4 and physically verify title controls, Refresh, populated pop-out, Sources Manual Entry, Settings diagnostics, tray, persistence, startup preference, and uninstall. Record failures with screenshot plus daily log before editing.

## Development and release commands

```powershell
npm ci
npm test
npm run build
npm run test:production-bundle
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.5'
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build -- --bundles nsis
```

Do not commit generated `src-tauri/Cargo.lock` or `src-tauri/gen/` unless repository policy deliberately changes; the root `Cargo.lock` is canonical. Before every release: synchronize version; run all gates; prove the frozen dashboard has no diff; build NSIS; inspect version/size/hash; launch only the new executable and confirm the daily log; commit/push; wait for CI/CodeQL; publish the exact verified installer; then complete `docs/windows-test-checklist.md`.

## Remaining Milestone 1 work

1. Complete physical 0.1.4 acceptance and fix only evidence-backed blockers.
2. Build a loopback service bound strictly to `127.0.0.1`, never all interfaces.
3. Add short-lived pairing and OS-backed long-lived secrets.
4. Validate origin, provider, timestamp, percentage, label and a maximum 16 KiB payload.
5. Build a least-privilege Manifest V3 Chromium companion.
6. Implement one fail-closed parser at a time: ChatGPT/Codex, Claude/Claude Code, Gemini.
7. Use sanitized fixtures and return `connector_update_required` for unknown page structure.
8. Test only with accounts the user controls in Chrome and Edge; call untested work “implemented but unverified.”
9. Finish extension installation, permissions, privacy, retention, and endpoint documentation.
10. Start API billing/cost work only after Milestone 1 is stable.

Never invent provider APIs or values; automate login; bypass access controls; reset allowance to 100% because a timer expired; or let one provider failure discard other last-good values. Notifications remain off by default and connector failure should mark retained data stale/disconnected.

## High-value file map

| Purpose | File |
|---|---|
| Approved design/spec | `docs/superpowers/specs/2026-09-03-ai-usage-meter-design.md` |
| 0.1.4 design and plan | `docs/superpowers/specs/2026-09-04-diagnostics-and-runtime-stabilization-design.md`, `docs/superpowers/plans/2026-09-04-diagnostics-runtime-stabilization.md` |
| Windows acceptance | `docs/windows-test-checklist.md` |
| Composition | `src/app/App.tsx` |
| Frozen dashboard | `src/features/dashboard/Dashboard.tsx`, `Dashboard.test.tsx`, `dashboard.css` |
| External windows | `src/external-windows/ExternalWindowRoute.tsx`, `src-tauri/src/lib.rs` |
| Native controls | `src/windows/nativeWindowService.ts` |
| Sources/setup | `src/features/sources/SourcesPage.tsx`, `src/features/setup/SetupFlow.tsx` |
| Usage/manual/SQLite | `src/usage/`, `src-tauri/migrations/0001_usage.sql` |
| Diagnostics | `src-tauri/src/diagnostics.rs`, `src/diagnostics/`, `src/features/settings/DiagnosticsSettingsCard.tsx` |
| Tray/startup | `src-tauri/src/tray.rs`, `src-tauri/src/startup.rs`, `src/features/tray/TrayPanel.tsx` |
| Production regression | `scripts/smoke-production-bundle.mjs` |

## Suggested continuation prompt

> Continue AI Usage Meter from GitHub main and read docs/HANDOFF.md completely. Preserve the approved dashboard and increment version from 0.1.4. First collect installed 0.1.4 acceptance results and its daily diagnostic log for any failed interaction. Do not claim automatic provider support without the documented loopback, pairing, extension, parser, security, and real-account work. Make targeted tested changes, build and verify a versioned installer, publish it, and update the handover with exact evidence.
