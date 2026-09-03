# AI Usage Meter Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Windows 11 desktop utility that tracks personal subscription allowances and reset times for ChatGPT/Codex, Claude/Claude Code, and Gemini through browser, CLI, or manual sources.

**Architecture:** Preserve the Ember Studio root React/Tauri application and add focused `usage`, `dashboard`, `history`, `sources`, and `alerts` modules rather than restructuring the repository. The Tauri layer owns SQLite, tray/native windows, credential-backed pairing, and a loopback-only ingestion service; a separate Manifest V3 extension sends validated normalized observations without exposing cookies or page contents.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Apache ECharts, Tauri 2, Rust, SQLite, Manifest V3 browser extension

**Spec:** `docs/superpowers/specs/2026-09-03-ai-usage-meter-design.md`

## Global Constraints

- Target Windows 11 first and preserve Ember's frameless, resizable shell.
- Milestone 1 tracks personal subscription allowances only; API billing remains a separate Milestone 2.
- No telemetry, cloud backend, automated login, password collection, cookie export, or browsing-history collection.
- Never fabricate allowance, reset, credit, or billing values.
- Keep provider-specific parsing outside React components.
- Store secrets only through an OS-backed credential abstraction; never in SQLite, frontend persistence, logs, or Git.
- Bind browser-companion ingestion to `127.0.0.1` only and require explicit pairing.
- Preserve unrelated Ember behavior and tests.
- Implement the approved `docs/screenshots/ai-usage-meter-dashboard-approved.png` layout without adding unrelated UI.

---

### Task 1: Rebrand the isolated Ember application

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/shell/TitleBar.tsx`
- Modify: `src/shell/TitleBar.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing Ember shell and Tauri configuration.
- Produces: package identity `ai-usage-meter`, Tauri identifier `com.aiusagemeter.desktop`, and visible product name `AI Usage Meter`.

- [ ] **Step 1: Add a failing title-bar branding test**

```tsx
render(<TitleBar />);
expect(screen.getByText('AI Usage Meter')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/shell/TitleBar.test.tsx`
Expected: FAIL because the cloned component still renders `Ember Studio`.

- [ ] **Step 3: Change only product identity fields and visible branding**

Use `ai-usage-meter` for package/crate/library names, `AI Usage Meter` for UI copy, and `com.aiusagemeter.desktop` for the bundle identifier. Preserve the existing flame mark and window controls.

- [ ] **Step 4: Run branding and baseline tests**

Run: `npm test -- src/shell/TitleBar.test.tsx src/shell/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/src/lib.rs src/shell/TitleBar.tsx src/shell/TitleBar.test.tsx README.md
git commit -m "chore: establish AI Usage Meter identity"
```

### Task 2: Add provider-neutral usage domain rules

**Files:**
- Create: `src/usage/usageTypes.ts`
- Create: `src/usage/usageMath.ts`
- Create: `src/usage/usageMath.test.ts`
- Create: `src/usage/fixtureUsage.ts`

**Interfaces:**
- Consumes: ISO timestamps and normalized provider observations.
- Produces: `ProviderId`, `SourceType`, `ConnectorState`, `UsageObservation`, `ProviderUsageState`, `clampPercent`, `getFreshness`, `getNextReset`, and `getLowestRemaining`.

- [ ] **Step 1: Write failing domain tests**

```ts
expect(clampPercent(125)).toBe(100);
expect(clampPercent(-2)).toBe(0);
expect(getLowestRemaining(states)?.providerId).toBe('anthropic');
expect(getFreshness('2026-09-03T12:00:00Z', '2026-09-03T12:06:00Z', 300_000)).toBe('stale');
```

- [ ] **Step 2: Run the tests and confirm missing-module failure**

Run: `npm test -- src/usage/usageMath.test.ts`
Expected: FAIL because `usageMath.ts` does not exist.

- [ ] **Step 3: Implement strict normalized types and pure calculations**

```ts
export type ProviderId = 'openai' | 'anthropic' | 'google';
export type SourceType = 'browser_extension' | 'cli' | 'manual';
export type Confidence = 'reported' | 'parsed' | 'manual' | 'estimated';
export type Freshness = 'fresh' | 'stale' | 'unavailable';

export interface UsageObservation {
  providerId: ProviderId;
  accountLabel?: string;
  remainingPercent?: number;
  usedPercent?: number;
  resetAt?: string;
  windowLabel?: string;
  observedAt: string;
  sourceType: SourceType;
  confidence: Confidence;
}
```

Reject non-finite percentages, clamp values to `0..100`, and compare resets only when `resetAt` parses as a future timestamp.

- [ ] **Step 4: Add clearly labeled fixture observations for UI development**

Use the approved visual values and mark every fixture with `isFixture: true`; production builds must not treat fixtures as connected provider data.

- [ ] **Step 5: Run domain tests**

Run: `npm test -- src/usage/usageMath.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/usage
git commit -m "feat: add normalized personal usage domain"
```

### Task 3: Build the approved Command Center dashboard

**Files:**
- Create: `src/features/dashboard/Dashboard.tsx`
- Create: `src/features/dashboard/Dashboard.test.tsx`
- Create: `src/features/dashboard/ProviderPanel.tsx`
- Create: `src/features/dashboard/UsageTrendChart.tsx`
- Create: `src/features/dashboard/dashboard.css`
- Create: `src/features/dashboard/dashboardTestData.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/shell/AppShell.tsx`
- Modify: `src/navigation/navigationRegistry.ts`
- Modify: `src/navigation/navigationTypes.ts`
- Modify: `src/styles/index.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ProviderUsageState[]`, refresh callback, and pop-out callback.
- Produces: `Dashboard`, `ProviderPanel`, and `UsageTrendChart` matching the approved desktop layout.

- [ ] **Step 1: Add failing dashboard behavior tests**

```tsx
render(<Dashboard providers={providers} history={history} onRefresh={refresh} onPopOutChart={popOut} />);
expect(screen.getByText('ChatGPT / Codex')).toBeInTheDocument();
expect(screen.getByText('72%')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Open seven-day usage in a new window' }));
expect(popOut).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the dashboard test and confirm it fails**

Run: `npm test -- src/features/dashboard/Dashboard.test.tsx`
Expected: FAIL because the dashboard components do not exist.

- [ ] **Step 3: Install Apache ECharts and its React binding**

Run: `npm install echarts echarts-for-react`
Expected: `package.json` and lockfile contain both dependencies.

- [ ] **Step 4: Implement the selected layout**

Use CSS grid for three equal provider panels and a full-width chart. Retain the unboxed top sidebar collapse glyph, remove the bottom collapse control, omit the top summary strip and recent-activity panel, and expose the chart pop-out button with an accessible name.

- [ ] **Step 5: Implement responsive behavior**

At narrower desktop widths, change the provider grid to two columns and then one column without hiding allowance, reset, source, freshness, or pop-out controls.

- [ ] **Step 6: Run dashboard and shell tests**

Run: `npm test -- src/features/dashboard/Dashboard.test.tsx src/shell/AppShell.test.tsx src/shell/Navigation.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app src/features/dashboard src/navigation src/shell src/styles
git commit -m "feat: build command center dashboard"
```

### Task 4: Add usage state, refresh isolation, and manual fallback

**Files:**
- Create: `src/usage/usageStore.tsx`
- Create: `src/usage/usageStore.test.tsx`
- Create: `src/usage/providerAdapter.ts`
- Create: `src/usage/manualUsageAdapter.ts`
- Create: `src/usage/manualUsageAdapter.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `PersonalUsageAdapter.fetch(): Promise<UsageObservation>`.
- Produces: `UsageProvider`, `useUsage`, `refreshProvider(providerId)`, `refreshAll()`, and `setManualObservation()`.

- [ ] **Step 1: Write failing isolation and manual-validation tests**

```ts
await store.refreshAll();
expect(store.get('openai').status).toBe('connected');
expect(store.get('anthropic').status).toBe('error');
expect(store.get('google').status).toBe('connected');
expect(() => manual.normalize({ remainingPercent: 101 })).toThrow('remainingPercent');
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/usage/usageStore.test.tsx src/usage/manualUsageAdapter.test.ts`
Expected: FAIL because the store and adapter do not exist.

- [ ] **Step 3: Implement adapters and independent refresh settlement**

Use `Promise.allSettled` and update only the provider associated with each result. Preserve each provider's last successful observation when a later refresh fails and calculate freshness from that successful timestamp.

- [ ] **Step 4: Implement manual observations**

Require provider, remaining percentage, observation time, and either a reset timestamp or an explicit `reset unavailable` selection. Persist `sourceType: 'manual'` and `confidence: 'manual'`.

- [ ] **Step 5: Run focused and dashboard tests**

Run: `npm test -- src/usage src/features/dashboard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/usage
git commit -m "feat: add isolated provider refresh state"
```

### Task 5: Add SQLite persistence behind a repository boundary

**Files:**
- Create: `src/usage/usageRepository.ts`
- Create: `src/usage/inMemoryUsageRepository.ts`
- Create: `src/usage/inMemoryUsageRepository.test.ts`
- Create: `src/usage/tauriSqlUsageRepository.ts`
- Create: `src/usage/tauriSqlUsageRepository.test.ts`
- Modify: `src/usage/usageStore.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/migrations/0001_usage.sql`

**Interfaces:**
- Consumes: validated `UsageObservation` records.
- Produces: `UsageRepository.saveObservation`, `getLatestByProvider`, `getHistory`, `saveConnectionEvent`, and `clearHistory`.

- [ ] **Step 1: Write repository contract tests against the in-memory implementation**

```ts
await repository.saveObservation(observation);
expect(await repository.getLatestByProvider('openai')).toEqual(observation);
expect(await repository.getHistory('openai', start, end)).toHaveLength(1);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/usage/inMemoryUsageRepository.test.ts`
Expected: FAIL because the repository contract does not exist.

- [ ] **Step 3: Implement the repository contract and in-memory adapter**

Use the in-memory adapter in browser/test environments and the SQL adapter only when the Tauri runtime is available.

- [ ] **Step 4: Add SQL plugin and migration**

Run: `npm install @tauri-apps/plugin-sql`

Create tables for `providers`, `usage_snapshots`, `connection_events`, `alerts`, and `app_settings`. Add indexes on `(provider_id, observed_at)` and alert delivery time. Do not create any secret columns.

- [ ] **Step 5: Implement and test SQL statement mapping**

Mock the Tauri database interface in Vitest and assert parameterized statements are used for insert and query operations.

- [ ] **Step 6: Run tests and Rust checks**

Run: `npm test -- src/usage`
Expected: PASS.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/usage src-tauri
git commit -m "feat: persist usage history in SQLite"
```

### Task 6: Reuse Ember external windows for the chart pop-out

**Files:**
- Create: `src/features/history/UsageChartWindow.tsx`
- Create: `src/features/history/UsageChartWindow.test.tsx`
- Modify: `src/external-windows/ExternalWindowRoute.tsx`
- Modify: `src/windows/windowRegistry.ts`
- Modify: `src/windows/windowTypes.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: existing `open(featureId)` external-window service and repository-backed seven-day history.
- Produces: registered external feature `usage-trend` and a dashboard pop-out action.

- [ ] **Step 1: Add a failing external-route test**

```tsx
render(<ExternalWindowRoute feature={usageTrendFeature} />);
expect(screen.getByRole('heading', { name: 'Seven-day usage trend' })).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/features/history/UsageChartWindow.test.tsx src/external-windows/ExternalWindowRoute.test.tsx`
Expected: FAIL because `usage-trend` is not registered.

- [ ] **Step 3: Register and render the chart feature**

Use the existing native window service and state lifecycle. Reuse `UsageTrendChart`; do not duplicate chart calculations or CSS.

- [ ] **Step 4: Run external-window regression tests**

Run: `npm test -- src/features/history/UsageChartWindow.test.tsx src/external-windows src/windows`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/features/history src/external-windows src/windows
git commit -m "feat: add usage chart pop-out window"
```

### Task 7: Add alert evaluation and settings surfaces

**Files:**
- Create: `src/alerts/alertEvaluator.ts`
- Create: `src/alerts/alertEvaluator.test.ts`
- Create: `src/features/alerts/AlertsPage.tsx`
- Create: `src/features/history/HistoryPage.tsx`
- Create: `src/features/sources/SourcesPage.tsx`
- Create: `src/features/settings/UsageSettingsPage.tsx`
- Create: `src/features/setup/SetupFlow.tsx`
- Create: `src/features/setup/SetupFlow.test.tsx`
- Create: `src/features/shared/featurePages.css`
- Modify: `src/shell/AppShell.tsx`
- Modify: `src/navigation/navigationRegistry.ts`

**Interfaces:**
- Consumes: normalized usage state, repository history, and existing Ember settings/notification services.
- Produces: threshold evaluation, reset confirmation events, and navigable setup/sources/history/alerts/settings pages.

- [ ] **Step 1: Write failing alert cooldown tests**

```ts
expect(evaluateThreshold(previous, current, rules)).toEqual(expect.objectContaining({ threshold: 25 }));
expect(evaluateThreshold(current, current, rules)).toBeNull();
expect(confirmReset(expectedReset, beforeReset, afterReset)?.kind).toBe('reset_confirmed');
```

- [ ] **Step 2: Write a failing setup persistence test**

```tsx
await user.click(screen.getByRole('button', { name: 'Save and continue' }));
expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'openai' }));
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- src/alerts src/features/setup`
Expected: FAIL because evaluator and setup flow do not exist.

- [ ] **Step 4: Implement alert rules and secondary pages**

Default notifications to disabled. Offer 50, 25, 10, 5, and exhausted thresholds. Build the four-step setup flow from the design spec and preserve progress after each step.

- [ ] **Step 5: Route navigation to actual feature content**

Replace the foundation welcome page only for AI Usage Meter routes. Keep existing settings, dialog, tooltip, notification, and color-profile infrastructure.

- [ ] **Step 6: Run UI and regression tests**

Run: `npm test -- src/alerts src/features src/shell src/settings src/notifications`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/alerts src/features src/navigation src/shell
git commit -m "feat: add usage setup history alerts and settings"
```

### Task 8: Add tray lifecycle and compact tray window

**Files:**
- Create: `src/features/tray/TrayPanel.tsx`
- Create: `src/features/tray/TrayPanel.test.tsx`
- Modify: `src/external-windows/ExternalWindowRoute.tsx`
- Modify: `src/windows/windowRegistry.ts`
- Create: `src-tauri/src/tray.rs`
- Create: `src-tauri/src/startup.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: latest normalized provider state, `launchOnStartup`, `startMinimized`, and existing external-window routing.
- Produces: tray menu, compact `tray-panel` window, show/hide behavior, refresh event, settings event, exit event, and Windows startup registration commands.

- [ ] **Step 1: Write a failing tray-panel test**

```tsx
render(<TrayPanel providers={providers} onOpenDashboard={open} onRefresh={refresh} />);
expect(screen.getByText('Claude')).toBeInTheDocument();
expect(screen.getByText('38%')).toBeInTheDocument();
expect(screen.getByText('47m')).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- src/features/tray/TrayPanel.test.tsx`
Expected: FAIL because the tray panel does not exist.

- [ ] **Step 3: Implement compact tray UI and native tray events**

Left-click opens/toggles the tray panel. The context menu exposes Open Dashboard, Refresh, Settings, and Exit. Closing the main window hides it when `minimizeToTray` is enabled.

- [ ] **Step 4: Implement explicit Windows startup settings**

Register or unregister startup only after the user changes `launchOnStartup`; default it to disabled. Honor `startMinimized` independently and expose command errors to Settings without preventing normal launch.

- [ ] **Step 5: Run frontend tests and Rust checks**

Run: `npm test -- src/features/tray src/external-windows src/windows`
Expected: PASS.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/tray src/external-windows src/windows src-tauri
git commit -m "feat: add Windows tray usage panel"
```

### Task 9: Add loopback pairing and validated ingestion

**Files:**
- Create: `src-tauri/src/ingestion.rs`
- Create: `src-tauri/src/pairing.rs`
- Create: `src-tauri/src/validation.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src/usage/ingestionClient.ts`
- Create: `src/usage/ingestionClient.test.ts`

**Interfaces:**
- Consumes: JSON `UsageObservation` payloads from the paired browser extension.
- Produces: loopback routes `GET /v1/health`, `POST /v1/pair`, and authenticated `POST /v1/observations`.

- [ ] **Step 1: Write failing Rust validation tests**

```rust
assert!(validate_origin("chrome-extension://abcdefghijklmnop").is_ok());
assert!(validate_origin("https://example.com").is_err());
assert!(validate_percent(38.0).is_ok());
assert!(validate_percent(101.0).is_err());
```

- [ ] **Step 2: Run focused Rust tests and confirm failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml validation`
Expected: FAIL because the validation module does not exist.

- [ ] **Step 3: Implement loopback-only listener and pairing**

Bind explicitly to `127.0.0.1:43127`. Generate a short-lived six-digit pairing code, exchange it once for a 32-byte random credential, store the desktop copy through the credential abstraction, and require `Authorization: Bearer <credential>` for observations. Reject payloads over 16 KiB.

- [ ] **Step 4: Implement strict payload validation**

Allow only known provider IDs, source type `browser_extension`, percentages in `0..100`, valid ISO timestamps, and bounded labels. Accept preflight only for paired Chromium-extension origins.

- [ ] **Step 5: Add frontend pairing-status client tests**

Mock Tauri commands and verify the Sources page never receives or renders the long-lived credential.

- [ ] **Step 6: Run tests and checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

Run: `npm test -- src/usage/ingestionClient.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri src/usage/ingestionClient.ts src/usage/ingestionClient.test.ts
git commit -m "feat: add secure local connector ingestion"
```

### Task 10: Add the Chromium browser companion

**Files:**
- Create: `browser-extension/manifest.json`
- Create: `browser-extension/package.json`
- Create: `browser-extension/tsconfig.json`
- Create: `browser-extension/vite.config.ts`
- Create: `browser-extension/src/background.ts`
- Create: `browser-extension/src/options/App.tsx`
- Create: `browser-extension/src/options/index.html`
- Create: `browser-extension/src/shared/messages.ts`
- Create: `browser-extension/src/shared/observationSchema.ts`
- Create: `browser-extension/src/connectors/connector.ts`
- Create: `browser-extension/src/connectors/openai.ts`
- Create: `browser-extension/src/connectors/anthropic.ts`
- Create: `browser-extension/src/connectors/google.ts`
- Create: `browser-extension/src/connectors/connectors.test.ts`
- Create: `browser-extension/src/fixtures/openai-usage.html`
- Create: `browser-extension/src/fixtures/anthropic-usage.html`
- Create: `browser-extension/src/fixtures/google-usage.html`

**Interfaces:**
- Consumes: user-enabled provider pages, pairing code, and loopback health/pairing endpoints.
- Produces: normalized browser-extension observations without authentication material or unrelated page content.

- [ ] **Step 1: Add sanitized fixture parser tests**

```ts
expect(openAiConnector.parse(openAiFixture)).toEqual(expect.objectContaining({ providerId: 'openai', remainingPercent: 72 }));
expect(anthropicConnector.parse(anthropicFixture)).toEqual(expect.objectContaining({ providerId: 'anthropic', remainingPercent: 38 }));
expect(googleConnector.parse(googleFixture)).toEqual(expect.objectContaining({ providerId: 'google', remainingPercent: 84 }));
```

- [ ] **Step 2: Run extension tests and confirm failure**

Run: `npm --prefix browser-extension test`
Expected: FAIL because the extension package and connectors do not exist.

- [ ] **Step 3: Implement minimal Manifest V3 permissions**

Grant host access only to documented provider usage/status pages and `http://127.0.0.1:43127/*`. Do not request history, cookies, webRequest, downloads, or broad `<all_urls>` access.

- [ ] **Step 4: Implement pairing and connector messaging**

Keep the credential in `chrome.storage.local`, never send it to page context, and attach it only in the background worker's loopback request. Content scripts send normalized non-secret fields to the background worker.

- [ ] **Step 5: Implement fail-closed parsers**

If required labels/selectors are missing or ambiguous, emit `connector_update_required` without sending an observation. Never infer a percentage from unrelated page text.

- [ ] **Step 6: Run extension tests and production build**

Run: `npm --prefix browser-extension test`
Expected: PASS.

Run: `npm --prefix browser-extension run build`
Expected: PASS and a load-unpacked `browser-extension/dist` directory.

- [ ] **Step 7: Commit**

```bash
git add browser-extension
git commit -m "feat: add paired Chromium usage companion"
```

### Task 11: Document current provider capability boundaries

**Files:**
- Create: `docs/provider-capability-matrix.md`
- Create: `docs/privacy-and-security.md`
- Create: `docs/browser-extension-installation.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: current authoritative provider documentation and tested connector behavior.
- Produces: exact support labels `SUPPORTED`, `PARTIAL`, `NOT AVAILABLE`, and `MANUAL FALLBACK` with source links and validation status.

- [ ] **Step 1: Research each personal-plan and API capability separately**

Record official documentation for consumer allowance visibility, CLI status, API usage, API costs, reset timing, and authentication. Do not cite third-party claims as provider capability facts.

- [ ] **Step 2: Write the matrix and connector limitations**

Distinguish `documented`, `observed in sanitized fixture`, and `real-account verified`. Mark real-account validation pending until completed on Windows with accounts the user controls.

- [ ] **Step 3: Document privacy behavior and installation**

List every requested extension permission, loopback endpoint, retained SQLite field, credential location, and diagnostic-log exclusion.

- [ ] **Step 4: Verify documentation consistency**

Run: `rg -n "API.*subscription|subscription.*API|cookie|telemetry|127\.0\.0\.1" README.md docs browser-extension/manifest.json`
Expected: statements match the spec and permission set; no claim equates API billing with subscription allowances.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/provider-capability-matrix.md docs/privacy-and-security.md docs/browser-extension-installation.md
git commit -m "docs: document provider and privacy boundaries"
```

### Task 12: Complete verification and Windows handoff

**Files:**
- Create: `design-qa.md`
- Create: `docs/windows-validation-checklist.md`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed frontend, Tauri backend, extension, tests, and approved visual target.
- Produces: repeatable CI checks, visual QA result, Windows validation checklist, and installation instructions.

- [ ] **Step 1: Add CI for frontend, Rust, and extension checks**

Run frontend tests/build, extension tests/build, `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` on supported runners.

- [ ] **Step 2: Run the complete local verification suite**

Run: `npm test && npm run build`
Expected: PASS.

Run: `npm --prefix browser-extension test && npm --prefix browser-extension run build`
Expected: PASS.

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 3: Perform visual design QA**

Render at `1440x1024`, compare with `docs/screenshots/ai-usage-meter-dashboard-approved.png`, record findings in `design-qa.md`, and fix all P0/P1/P2 differences before setting `final result: passed`.

- [ ] **Step 4: Record Windows-only validation honestly**

Complete every check that can run in the current environment. Mark actual Windows installation, native tray, startup, Credential Manager, and real-account connector checks as `passed`, `failed`, or `blocked` with evidence; never infer Windows success from a web preview.

- [ ] **Step 5: Run secret and telemetry scans**

Run: `rg -n --hidden -g '!node_modules/**' -g '!dist/**' -g '!target/**' "sk-[A-Za-z0-9]|ANTHROPIC_API_KEY|GEMINI_API_KEY|posthog|segment|telemetry" .`
Expected: no secrets and no telemetry implementation.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md design-qa.md docs/windows-validation-checklist.md
git commit -m "test: add release verification and CI"
```
