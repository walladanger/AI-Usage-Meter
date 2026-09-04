# Diagnostics and Runtime Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship version `0.1.4` with daily retained diagnostics visible in Settings, a working packaged chart pop-out, and a responsive Sources flow that accurately identifies Manual Entry as the only available provider source.

**Architecture:** Rust owns diagnostic persistence, retention, bounded reads, and dynamic window creation. React consumes narrow native adapters, renders a bounded Settings viewer, and uses a pre-injected feature identity for dynamic windows. Provider connector development remains outside this release; the setup flow fails fast instead of waiting indefinitely or presenting unimplemented connectivity as available.

**Tech Stack:** React 19, TypeScript 7, Vitest 4, Tauri 2.11, Rust 2021, `time` 0.3, Vite 8, NSIS, Windows 11.

**Spec:** `docs/superpowers/specs/2026-09-04-diagnostics-and-runtime-stabilization-design.md`

## Global Constraints

- GitHub `main` at `walladanger/AI-Usage-Meter` remains the source of truth for the approved dashboard.
- Do not modify `src/features/dashboard/Dashboard.tsx`, `Dashboard.test.tsx`, or `dashboard.css`.
- Version every package and executable as `0.1.4`.
- Keep diagnostic data local unless the user explicitly copies or uploads it.
- Never log credentials, cookies, tokens, passwords, prompts, conversations, browsing history, provider HTML, allowance values, or reset timestamps.
- Keep only daily files for today and the preceding 13 local calendar days; never delete unknown files or `startup-diagnostics.log`.
- Bound each log read to the newest 512 KiB.
- Do not claim automatic provider support in this release.
- Do not commit generated `src-tauri/Cargo.lock` or `src-tauri/gen/` files when they are not tracked by the repository.
- Do not claim the physical pop-out or Sources flow passed until tested in the installed Windows build.

---

### Task 1: Native daily diagnostic storage and safe read API

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Rewrite: `src-tauri/src/diagnostics.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `DiagnosticLogFile { date, filename, size_bytes, modified_at }`.
- Produces `DiagnosticLogList { directory, files }`.
- Produces `DiagnosticLogContent { filename, content, truncated }`.
- Produces `diagnostics::list_logs(&AppHandle) -> Result<DiagnosticLogList, String>`.
- Produces `diagnostics::read_log(&AppHandle, &str) -> Result<DiagnosticLogContent, String>`.
- Keeps `NativeDiagnostics::install`, `record_native`, and `record_frontend` compatible with current callers.

- [ ] **Step 1: Add failing native tests for daily files and launch metadata**

Add internal tests in `src-tauri/src/diagnostics.rs` using a unique directory beneath `std::env::temp_dir()`. The tests must construct diagnostics with an explicit local `Date` and process ID so expectations are deterministic:

```rust
#[test]
fn writes_versioned_launch_event_to_the_daily_file() {
    let fixture = TestDirectory::new("daily-launch");
    let date = Date::from_calendar_date(2026, Month::September, 4).unwrap();
    let diagnostics = NativeDiagnostics::for_directory(fixture.path().to_path_buf());

    diagnostics.begin_launch_at(date, "0.1.4", 42);

    let content = fs::read_to_string(fixture.path().join("ai-usage-meter-2026-09-04.log")).unwrap();
    assert!(content.contains("version=0.1.4"));
    assert!(content.contains("pid=42"));
}
```

- [ ] **Step 2: Add failing native retention and safety tests**

Create literal files for `2026-08-21`, `2026-08-22`, `2026-09-04`, `startup-diagnostics.log`, and `notes.txt`. Assert pruning on `2026-09-04` removes only the matching August 21 daily file. Add validation cases for `../settings.json`, an absolute path, the legacy filename, a malformed date, and a valid daily filename. Add a 512 KiB plus 64 byte file and assert the bounded reader returns only the newest 512 KiB with `truncated: true`.

```rust
assert!(!is_valid_daily_filename("../settings.json"));
assert!(!is_valid_daily_filename("startup-diagnostics.log"));
assert!(is_valid_daily_filename("ai-usage-meter-2026-09-04.log"));
assert_eq!(result.content.len(), 512 * 1024);
assert!(result.truncated);
```

- [ ] **Step 3: Run the native tests and verify RED**

Run:

```powershell
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.4-test'
cargo test --manifest-path src-tauri/Cargo.toml diagnostics
```

Expected: compilation or assertions fail because the daily diagnostics API does not exist.

- [ ] **Step 4: Add deterministic local-date support**

Add:

```toml
time = { version = "0.3", features = ["formatting", "local-offset", "macros", "parsing"] }
```

Use `OffsetDateTime::now_local()` with a UTC fallback. Centralize filename formatting with `[year]-[month]-[day]` and keep all filesystem helpers private to `diagnostics.rs`.

- [ ] **Step 5: Implement daily writes and retention**

Change `NativeDiagnostics` to retain a directory rather than one file. `install` must create the directory, prune matching daily files, write a launch marker with `env!("CARGO_PKG_VERSION")` and `std::process::id()`, then manage the state. `record` must derive today's local file and append one UTF-8 line. Filesystem failures remain best-effort for recording.

- [ ] **Step 6: Implement bounded list and read operations**

Return newest-first daily metadata. Validate filenames before joining paths. Open reads with `std::fs::File`, seek from the end when the file exceeds `512 * 1024`, and decode with `String::from_utf8_lossy`. Run directory scans, pruning, and reads through `tauri::async_runtime::spawn_blocking` in command wrappers so the UI thread is not blocked.

- [ ] **Step 7: Register native commands and structured errors**

Add these Tauri commands in `src-tauri/src/lib.rs` and register them in `generate_handler!`:

```rust
#[tauri::command]
async fn list_diagnostic_logs(app: AppHandle) -> CommandResult<diagnostics::DiagnosticLogList>

#[tauri::command]
async fn read_diagnostic_log(app: AppHandle, filename: String) -> CommandResult<diagnostics::DiagnosticLogContent>
```

Map validation to `invalid-request`, and filesystem failures to `native-window-error` or a new stable `diagnostics-failed` code.

- [ ] **Step 8: Verify GREEN and commit**

Run the focused native tests, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `cargo check`. Commit only Task 1 files:

```powershell
git add src-tauri/Cargo.toml src-tauri/src/diagnostics.rs src-tauri/src/lib.rs
git commit -m "feat: add retained daily diagnostics"
```

---

### Task 2: Frontend diagnostics service and Settings viewer

**Files:**
- Create: `src/diagnostics/diagnosticLogService.ts`
- Create: `src/diagnostics/diagnosticLogService.test.ts`
- Create: `src/features/settings/DiagnosticsSettingsCard.tsx`
- Create: `src/features/settings/DiagnosticsSettingsCard.test.tsx`
- Create: `src/features/settings/diagnosticsSettings.css`
- Modify: `src/features/settings/UsageSettingsPage.tsx`

**Interfaces:**
- Produces `DiagnosticLogFile`, `DiagnosticLogList`, and `DiagnosticLogContent` TypeScript interfaces matching Rust camelCase serialization.
- Produces `DiagnosticLogPort { list(): Promise<DiagnosticLogList>; read(filename: string): Promise<DiagnosticLogContent> }`.
- Produces `createTauriDiagnosticLogPort`, `createBrowserDiagnosticLogPort`, and `getDiagnosticLogPort`.
- Produces `<DiagnosticsSettingsCard port?: DiagnosticLogPort clipboard?: Pick<Clipboard, 'writeText'> />`.

- [ ] **Step 1: Write failing service adapter tests**

Assert a native port invokes `list_diagnostic_logs` and `read_diagnostic_log` with `{ filename }`. Assert the browser port returns an empty list with a human-readable preview directory and does not call Tauri.

```ts
expect(invoke).toHaveBeenNthCalledWith(1, 'list_diagnostic_logs');
expect(invoke).toHaveBeenNthCalledWith(2, 'read_diagnostic_log', { filename: 'ai-usage-meter-2026-09-04.log' });
```

- [ ] **Step 2: Write failing viewer behavior tests**

Use a real in-memory `DiagnosticLogPort`. Test newest-first default selection, selected content, refresh, empty state, truncation notice, copy success, copy failure, list failure, read failure, and stale-response suppression. Assertions target visible state rather than mock call counts.

```tsx
expect(await screen.findByRole('option', { name: /Sep 4, 2026/ })).toBeInTheDocument();
expect(screen.getByRole('textbox', { name: 'Diagnostic log content' })).toHaveValue('native bootstrap');
expect(screen.getByText('Showing the newest 512 KiB.')).toBeInTheDocument();
```

- [ ] **Step 3: Run focused frontend tests and verify RED**

Run:

```powershell
npm test -- --run src/diagnostics/diagnosticLogService.test.ts src/features/settings/DiagnosticsSettingsCard.test.tsx
```

Expected: tests fail because the service and component do not exist.

- [ ] **Step 4: Implement the runtime adapter**

Select native behavior only through `isTauriRuntime()`. Keep the browser adapter side-effect-free. Normalize native errors into readable `Error` objects without exposing raw filesystem paths received from rejected requests.

- [ ] **Step 5: Implement the bounded viewer state machine**

On mount, list logs once. Select the newest filename and read it. Use an incrementing request ID in refs for list and read requests so late results are ignored. Render content in a read-only `<textarea>` with `aria-label="Diagnostic log content"`. Copy only the visible bounded content through the injected clipboard.

- [ ] **Step 6: Integrate the card into Settings**

Place `<DiagnosticsSettingsCard />` after Appearance in `UsageSettingsPage`. Reuse `feature-card feature-card--wide`; add only component-local layout, select, textarea, and status styles. Do not touch dashboard files or global Ember shell structure.

- [ ] **Step 7: Verify GREEN and commit**

Run both focused test files and the existing Settings tests. Commit:

```powershell
git add src/diagnostics/diagnosticLogService.ts src/diagnostics/diagnosticLogService.test.ts src/features/settings/DiagnosticsSettingsCard.tsx src/features/settings/DiagnosticsSettingsCard.test.tsx src/features/settings/diagnosticsSettings.css src/features/settings/UsageSettingsPage.tsx
git commit -m "feat: show retained diagnostics in settings"
```

---

### Task 3: Shared action diagnostics and working dynamic pop-outs

**Files:**
- Create: `src/diagnostics/appDiagnostics.ts`
- Create: `src/diagnostics/appDiagnostics.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/external-windows/ExternalWindowRoute.tsx`
- Modify: `src/external-windows/ExternalWindowRoute.test.tsx`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `recordAppDiagnostic(level: DiagnosticLevel, message: string): Promise<void>`.
- Produces `injectedExternalFeatureId(browserWindow: Window): string | undefined`.
- Extends `selectExternalFeature(search, registry, injectedFeatureId?)`.
- Produces Rust `external_feature_init_script(feature_id: &str) -> String`.

- [ ] **Step 1: Write failing frontend tests for injected routing**

Add cases showing that an injected `usage-trend` selects the registered chart while an unknown or internal-only injected value is rejected. Query routing for the static tray panel must keep passing.

```ts
expect(selectExternalFeature('', windowRegistry, 'usage-trend')?.id).toBe('usage-trend');
expect(selectExternalFeature('', windowRegistry, '../settings')).toBeNull();
```

- [ ] **Step 2: Write failing Rust tests for dynamic startup metadata**

Change the existing URL expectation to plain `index.html`. Assert the initialization script JSON-encodes the validated feature and defines a non-writable global:

```rust
assert_eq!(external_feature_url(), PathBuf::from("index.html"));
assert!(external_feature_init_script("usage-trend").contains("usage-trend"));
assert!(external_feature_init_script("usage-trend").contains("writable: false"));
```

- [ ] **Step 3: Run focused tests and verify RED**

Run the ExternalWindowRoute Vitest file and the named Rust pop-out tests. Expected failures must show missing injected routing and the old query-bearing app path.

- [ ] **Step 4: Implement shared frontend diagnostics**

Move the Tauri-versus-console diagnostic port selection out of `main.tsx` into `appDiagnostics.ts`. Prefix bootstrap messages with the current window identity and sanitized route kind. Components use the same safe function for action events; failed writes fall back to the console and never reject the user action.

- [ ] **Step 5: Implement injected external identity selection**

Declare the global as optional and unknown, accept it only when it is a string, and pass it into `selectExternalFeature`. If any external identity is requested but does not resolve, render `renderStartupFailure` and record an error instead of mounting the main dashboard in the secondary window.

- [ ] **Step 6: Build dynamic windows from plain `index.html`**

In Rust, validate the feature ID before producing the initialization script. Use:

```rust
WebviewWindowBuilder::new(&app, &request.label, WebviewUrl::App("index.html".into()))
    .initialization_script(external_feature_init_script(&request.feature_id))
    .on_page_load(|window, payload| {
        diagnostics::record_native(
            &window.app_handle(),
            "INFO",
            &format!("External page load {:?}; label={}", payload.event(), window.label()),
        );
    })
```

Record sanitized request, focus, build, success, failure, page-load, and destruction events. Map build failures after recording them.

- [ ] **Step 7: Verify GREEN and commit**

Run focused frontend and Rust tests, then commit:

```powershell
git add src/diagnostics/appDiagnostics.ts src/diagnostics/appDiagnostics.test.ts src/main.tsx src/app/App.tsx src/external-windows/ExternalWindowRoute.tsx src/external-windows/ExternalWindowRoute.test.tsx src-tauri/src/lib.rs
git commit -m "fix: load dynamic feature windows from app entry"
```

---

### Task 4: Responsive and honest Sources setup

**Files:**
- Create: `src/runtime/withTimeout.ts`
- Create: `src/runtime/withTimeout.test.ts`
- Modify: `src/features/setup/SetupFlow.tsx`
- Modify: `src/features/setup/SetupFlow.test.tsx`
- Modify: `src/features/sources/SourcesPage.tsx`
- Modify: `src/features/sources/SourcesPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T>`.
- Changes the default `SetupDraft.sourceType` to `manual`.
- Adds optional `report(level, message)` to `SetupFlowProps` for safe action diagnostics.

- [ ] **Step 1: Write failing timeout tests**

Use fake timers to assert a settled operation passes through and a pending operation rejects after 5,000 ms with `Settings save timed out after 5 seconds.`. Restore real timers after each test.

- [ ] **Step 2: Write failing setup behavior tests**

Assert Manual Entry is initially selected, Browser Companion displays `Not installed yet` and is disabled, the action reads `Saving…` while persistence is pending, success advances one step, rejection restores the action with an error, and a five-second timeout does the same. Add a saved legacy browser draft and assert Continue is blocked until Manual Entry is selected.

- [ ] **Step 3: Write failing Sources page truthfulness tests**

Assert the Sources card states that automatic connections are not installed and that `Open guided setup` remains available for Manual Entry. Assert manual validation and successful persistence still produce their existing visible outcomes.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```powershell
npm test -- --run src/runtime/withTimeout.test.ts src/features/setup/SetupFlow.test.tsx src/features/sources/SourcesPage.test.tsx
```

Expected: tests fail on the browser default, missing unavailable state, missing pending label, and absent timeout behavior.

- [ ] **Step 5: Implement timeout and setup state**

Wrap only wizard persistence with `withTimeout(saveDraft(draft), 5000, ...)`. Track mounted state or an operation generation so late completion after timeout/unmount cannot advance a remounted wizard. Disable unavailable browser selection and require Manual Entry before saving a legacy browser draft. Keep the Back action responsive whenever no save is active.

- [ ] **Step 6: Add sanitized action diagnostics**

Record setup open, selected provider ID, step number, source kind, save start, success, rejection, and timeout. Do not include settings JSON, percentages, reset timestamps, credentials, or page content. Add matching native persistence start/success/failure entries around `save_settings`.

- [ ] **Step 7: Verify GREEN and commit**

Run focused tests and existing settings tests, then commit:

```powershell
git add src/runtime/withTimeout.ts src/runtime/withTimeout.test.ts src/features/setup/SetupFlow.tsx src/features/setup/SetupFlow.test.tsx src/features/sources/SourcesPage.tsx src/features/sources/SourcesPage.test.tsx src/app/App.tsx src-tauri/src/lib.rs
git commit -m "fix: make source setup responsive and accurate"
```

---

### Task 5: Version, full verification, Windows acceptance, and verbose handoff

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Rewrite: `docs/HANDOFF.md`
- Modify as evidence requires: `docs/windows-test-checklist.md`

**Interfaces:**
- Produces NSIS installer `AI Usage Meter_0.1.4_x64-setup.exe`.
- Produces a standalone `docs/HANDOFF.md` sufficient for an agent with no prior conversation.

- [ ] **Step 1: Synchronize version `0.1.4`**

Update both package-lock root occurrences, package.json, Cargo.toml, and tauri.conf.json. Search these files for stale `0.1.3` values and distinguish dependency versions from application versions.

- [ ] **Step 2: Run complete frontend verification**

Run:

```powershell
npm test
npm run build
npm run test:production-bundle
```

Require zero failing test files, zero failing tests, successful TypeScript compilation, successful Vite production output, and a rendered production dashboard.

- [ ] **Step 3: Run complete Rust verification**

Use a target directory outside the hidden `.codex` tree because Windows Application Control blocks generated executables there:

```powershell
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.4'
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 4: Prove the dashboard is unchanged**

Run:

```powershell
git diff --exit-code 2850703d2f4be6e667af12637ce13f21db68ee18 -- src/features/dashboard/Dashboard.tsx src/features/dashboard/Dashboard.test.tsx src/features/dashboard/dashboard.css
```

Expected: exit code 0 and no content diff.

- [ ] **Step 5: Build and inspect the Windows installer**

Run:

```powershell
$env:CARGO_TARGET_DIR='C:\Users\Warwick\source\codex-build\ai-usage-meter-0.1.4'
npm run tauri:build -- --bundles nsis
```

Inspect ProductVersion and FileVersion on both the release executable and installer. Record installer bytes and SHA-256.

- [ ] **Step 6: Verify the packaged daily log**

Record today's log size or line count. Launch the release executable with `Start-Process -WindowStyle Hidden -PassThru`, wait no longer than five seconds, verify new versioned native and frontend entries appear in today's daily file, then stop only the process started by this check. Do not stop the user's separately installed process.

- [ ] **Step 7: Perform physical installed-app acceptance**

Completely exit the old installed process, install `0.1.4`, and verify:

```text
Settings lists and reads today's log without freezing.
The chart pop-out displays the chart rather than white content.
The daily log records native window creation and external frontend bootstrap.
Sources defaults to Manual Entry.
Browser Companion is visibly unavailable and cannot claim a connection.
Save and continue advances, or returns a readable failure within five seconds.
Manual provider entry persists after restart.
```

Record any item that cannot be completed as unverified rather than passed.

- [ ] **Step 8: Write the standalone verbose handover**

Rewrite `docs/HANDOFF.md` using the section inventory in the approved spec. Include exact repository URL, base commit, branch, versions, tool versions, commands, Windows target-directory workaround, log schemas and paths, native/frontend interfaces, architecture map, security exclusions, test counts, artifact metadata, known limitations, connector roadmap, GitHub upload result, and first commands for the next agent. Do not include secrets or credential material.

- [ ] **Step 9: Final diff and secret review**

Run `git diff --check`, inspect `git status --short`, and scan tracked changes for common API-key/token patterns. Remove generated untracked Rust schema and lock files through explicit reviewed paths. Confirm only intended files remain.

- [ ] **Step 10: Commit the release implementation**

Commit any remaining version, verification, and handoff files:

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json docs/HANDOFF.md docs/windows-test-checklist.md docs/superpowers/plans/2026-09-04-diagnostics-runtime-stabilization.md
git commit -m "release: prepare AI Usage Meter 0.1.4"
```

- [ ] **Step 11: Push code and upload the installer**

Push the current branch to `origin`. Use the authenticated GitHub web session or available GitHub release tooling to create an `v0.1.4` prerelease and attach exactly the verified NSIS installer. Confirm the remote commit SHA and downloadable asset URL. If release upload is blocked by missing authentication or permissions, report that exact blocker while preserving the successful code push and local installer.

- [ ] **Step 12: Deliver final evidence**

Provide clickable local and GitHub installer links, SHA-256, version, test counts, physical verification status, commit SHA, branch, release URL, log location, and handoff link. State every remaining unimplemented or unverified capability plainly.

