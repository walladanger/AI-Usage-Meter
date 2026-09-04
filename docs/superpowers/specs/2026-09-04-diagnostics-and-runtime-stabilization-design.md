# Diagnostics and Runtime Stabilization Design

## Summary

Version `0.1.4` is a stabilization release for AI Usage Meter. It will make diagnostics useful from inside the installed application, repair the still-white dynamic chart pop-out, and prevent the Sources setup flow from appearing frozen or claiming that an unavailable automatic connector can be used. It will not implement the browser extension, loopback ingestion service, provider parsers, API billing, or any other provider capability that does not currently exist.

The approved Command Center dashboard and unrelated Ember Studio foundation styling must remain unchanged.

## Evidence and root causes

The installed `0.1.3` application writes launch events to:

`%APPDATA%\com.aiusagemeter.desktop\logs\startup-diagnostics.log`

The current session log contains native bootstrap, startup integration, tray setup, frontend bootstrap, module-load, and React-render entries. It contains no entries for chart pop-out requests or Sources setup actions, so it cannot distinguish a failed native window creation from a page that failed to load.

The tray panel successfully loads from a statically configured URL, while the dynamically created usage-trend window remains white. Dynamic windows currently pass a query-bearing path through `WebviewUrl::App`. Version `0.1.4` will remove routing information from that path: dynamic windows will load the plain packaged application entry document and receive their feature identity separately before application code executes.

The Sources wizard offers a Browser Companion path even though the handoff explicitly lists the loopback ingestion service, pairing, Manifest V3 extension, provider parsers, and real-account validation as not implemented. The current setup flow also waits indefinitely for settings persistence and records no action-level diagnostics. This creates an apparent freeze and a false expectation that an automatic connection can complete.

## Scope

### Included

- Advance every application and package version field to `0.1.4`.
- Replace the single append-only startup log with one UTF-8 diagnostic log per local calendar day.
- Retain exactly 14 calendar days, including the current day, and delete older diagnostic files.
- Preserve the legacy `startup-diagnostics.log` as a readable historical file in the log directory, but stop writing new events to it.
- Add safe native commands to list daily logs and read one selected daily log.
- Add a Diagnostics card to the existing Settings page.
- Let the user select a retained date, refresh the list, view the selected log, and copy its visible content.
- Display the resolved diagnostics directory in Settings.
- Bound native reads and UI rendering so a large or malformed log cannot freeze the application.
- Add action-level diagnostics for dynamic pop-outs and Sources setup.
- Repair dynamic external-window routing without changing the dashboard.
- Make unavailable automatic connector choices explicit and non-actionable.
- Keep manual provider observations available.
- Add persistence timeouts and readable setup errors so Continue never waits forever.
- Update `docs/HANDOFF.md` with complete build, debugging, release, and continuation information.
- Build and verify a Windows NSIS installer, commit the completed work, and push it to the configured GitHub repository.

### Excluded

- Chromium extension implementation.
- Loopback server or pairing protocol.
- ChatGPT, Claude, or Gemini private-page parsers.
- Automated provider login.
- Cookies, access tokens, passwords, prompts, conversations, or browsing-history collection.
- API billing and organization usage integrations.
- Dashboard layout, content, typography, or styling changes.

## Daily diagnostic storage

The native diagnostics module remains the only writer. Each event is appended to:

`%APPDATA%\com.aiusagemeter.desktop\logs\ai-usage-meter-YYYY-MM-DD.log`

The filename date uses local calendar time so the Settings date selector matches the user's day. Every process launch begins with an entry containing the application version and process identifier. Every line contains a timestamp, severity, component, window identity when available, and a sanitized message.

At native diagnostics initialization and whenever the Settings viewer requests the file list, the application scans only its diagnostics directory. Files matching the exact daily filename pattern are retained for the current local date and preceding 13 dates. Matching files older than that window are deleted. Unknown files and the legacy `startup-diagnostics.log` are not deleted.

Logging failures must never prevent application startup or make UI actions wait indefinitely.

## Safe native log access

The backend exposes read-only commands with structured results:

- `list_diagnostic_logs` returns the resolved directory and retained daily files ordered newest first. Each item contains only its date, filename, byte size, and modified timestamp.
- `read_diagnostic_log` accepts a filename that must match the exact daily filename pattern and must appear in the diagnostics directory. Path separators, traversal components, absolute paths, and unknown names are rejected.

Each read returns at most the newest 512 KiB. If a file is larger, the result reports that older content was omitted. Invalid UTF-8 is decoded lossily instead of crashing. These commands never modify a selected log.

The frontend uses a browser-safe in-memory diagnostics adapter during preview and tests. Native commands are selected only through the shared public Tauri runtime detector.

## Settings diagnostics viewer

The existing Settings page gains one wide `Diagnostics` card below the current controls. It follows the established feature-card styling rather than introducing a new design system.

The card contains:

- A short statement that logs stay on this computer and exclude credentials and account content.
- The resolved log directory.
- A date selector populated newest first.
- `Refresh logs` and `Copy visible log` buttons.
- A read-only, scrollable monospace log viewer.
- Loading, empty, truncated, copied, and error states expressed in text.

Opening Settings starts one bounded list request. Selecting another date starts one bounded read request. Stale async responses must not replace a newer selection. Clipboard failure produces a readable error and does not clear the displayed log.

No log is uploaded automatically. Copying is an explicit local user action.

## Diagnostic instrumentation

Native diagnostics add events for:

- Dynamic external-window request received, including sanitized feature ID and label.
- Existing window focused.
- Packaged entry document selected.
- Window build success or failure.
- Page-load start and finish when the native API exposes those events.
- External window destroyed.
- Settings log-list and log-read failures without echoing user-controlled path content.
- Settings persistence start, completion, failure, and timeout.

Frontend diagnostics add a stable window identity to bootstrap entries and record:

- External feature identity resolved or rejected.
- Sources wizard opened and closed.
- Setup step advance requested.
- Settings save completed, failed, or timed out.
- Unavailable Browser Companion choice blocked.
- Manual observation validation and persistence success or failure, without logging allowance values or reset timestamps.

No diagnostic event may contain credentials, cookies, authorization headers, access tokens, passwords, prompts, conversations, browsing history, provider-page HTML, manual allowance values, or reset timestamps.

## Dynamic pop-out repair

Dynamic external windows will use `WebviewUrl::App("index.html".into())` exactly. The validated feature ID will be injected before frontend modules execute using a small initialization script that assigns a JSON-encoded value to a dedicated read-only global. The query-string route remains supported for the statically configured tray panel and browser tests.

Feature selection follows this order:

1. Valid injected dynamic feature identity.
2. Valid `window=external&feature=...` query identity.
3. No external feature.

The injected value is accepted only if it maps to a registered feature whose presentation permits an external window. Unknown values render the startup recovery screen and write a diagnostic instead of leaving an all-white surface.

The dynamic builder records creation and page-load lifecycle events. A packaged Windows verification must demonstrate both native creation and frontend bootstrap entries for the usage-trend window.

## Sources stabilization

The Browser Companion option remains visible to communicate the intended Milestone 1 direction, but it is labelled `Not installed yet` and cannot be selected as a working connection. The setup wizard defaults to Manual Entry until the companion exists. If an older saved draft names `browser_extension`, the wizard displays the unavailable state and requires Manual Entry before continuing.

Every settings save used by the wizard is bounded by a five-second timeout. During a save, the action reads `Saving…` and is disabled. Success advances exactly one step. Failure or timeout restores the action and displays a persistent error. Closing or leaving the wizard does not leave a pending state attached to a future mount.

Manual entry remains the only supported provider data source in `0.1.4`. The app must state this clearly and must not label fixture data or an unimplemented companion as connected live data.

Actual automatic connectivity begins only after this stabilization release passes physical Windows acceptance. That work follows the existing handoff order: secure loopback ingestion, explicit pairing, Chromium companion, then one fail-closed provider parser at a time.

## Error handling and responsiveness

- Native file errors become structured command errors and diagnostic entries where possible.
- Frontend log-viewer errors remain inside the Diagnostics card.
- Setup persistence failures remain inside the setup flow.
- All UI-triggered native promises have success and failure handling.
- File reads, directory scans, and pruning occur off the UI thread.
- No unbounded file content is sent to or rendered by the frontend.
- Diagnostic logging is best-effort and never becomes a startup dependency.

## Testing and verification

Test-driven development is required for every behavior change.

Rust tests cover:

- Daily filename generation.
- Fourteen-day retention boundaries.
- Oldest-file deletion without deleting unknown or legacy files.
- Filename/path validation.
- Tail-bounded reads and truncation reporting.
- Dynamic window startup metadata generation.

Frontend tests cover:

- Native versus browser diagnostics adapter selection.
- Newest-first date selection and selected-log rendering.
- Refresh, copy, empty, truncation, stale-response, and error states.
- Injected external-feature selection and invalid identity rejection.
- Manual default and unavailable Browser Companion behavior.
- Setup save success, failure, and timeout recovery.
- Required diagnostic action events without sensitive values.

Release verification includes:

- Full Vitest suite.
- TypeScript and Vite production build.
- Production-bundle smoke test.
- Rust formatting, tests, and compile check.
- Windows NSIS packaging.
- Embedded executable and installer version inspection.
- SHA-256 installer hash.
- Direct packaged-executable launch verifying creation of today's daily log.
- Physical usage-trend pop-out verification using the installed build.
- Sources manual-flow verification and confirmation that unavailable automatic setup cannot freeze.
- Content diff confirming the approved dashboard files remain identical to GitHub `main`.

## Release and GitHub handoff

After verification, all intended changes are committed on the working branch and pushed to the configured GitHub remote. The installer is provided as a local downloadable file. If repository release permissions and workflow support are available, the installer is also attached to a GitHub release or workflow artifact; otherwise the push result and local installer path are reported separately without claiming a remote binary upload.

The final `docs/HANDOFF.md` must be rewritten as a standalone, verbose continuation guide for an agent with no previous conversation. It must include:

- Product purpose and strict scope boundaries.
- Approved UI constraints.
- Repository, branch, remote, and source-of-truth rules.
- Current version and exact build metadata locations.
- Implemented architecture and file map.
- Every relevant development tool, runtime, package manager, build command, test command, and Windows-specific constraint.
- Diagnostics architecture, file locations, retention rules, command interfaces, and privacy exclusions.
- Pop-out architecture and the evidence behind the final fix.
- Sources/manual-entry behavior and explicit unimplemented connector work.
- Completed tests and physical verification results, with failures or unverified items stated plainly.
- Installer path, filename, size, embedded version, and SHA-256 hash.
- Commit and push identifiers.
- Known issues and prioritized continuation order.
- Security guardrails and forbidden data handling.
- Exact first steps for the next agent.

