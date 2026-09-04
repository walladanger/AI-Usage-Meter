# Windows Verification Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible, unsigned Windows 11 test installer in GitHub Actions so the current desktop shell can be installed and manually verified before browser connectors or API billing integrations are added.

**Architecture:** Keep the existing React/Tauri application unchanged. Add the project-local Tauri CLI, extend the current CI workflow with a gated Windows NSIS bundle job, and upload the installer as a temporary GitHub Actions artifact. Do not publish a GitHub Release until the installer passes the manual Windows checklist.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2, Rust stable, GitHub Actions `windows-latest`, NSIS

**Spec:** `docs/superpowers/specs/2026-09-03-ai-usage-meter-design.md`

## Global Constraints

- Preserve the approved Image 1 layout and all existing application behavior.
- Do not begin API billing integrations in this milestone.
- Build Windows x64 first.
- Produce an unsigned test artifact; clearly identify expected Windows SmartScreen warnings.
- Do not call the build production-ready until it is installed and exercised on Windows 11.
- Keep the original Ember repository untouched.

---

### Task 1: Add reproducible native build commands

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing Vite `build` script and `src-tauri/tauri.conf.json`.
- Produces: project-local `tauri`, `tauri:dev`, and `tauri:build` npm commands.

- [ ] **Step 1: Record the missing-command failure**

Run:

```bash
npm run tauri:build
```

Expected: FAIL because `tauri:build` does not exist.

- [ ] **Step 2: Add the matching Tauri v2 CLI**

Run:

```bash
npm install --save-dev @tauri-apps/cli@^2
```

Add these scripts to `package.json`:

```json
"tauri": "tauri",
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

- [ ] **Step 3: Verify the project-local CLI**

Run:

```bash
npm run tauri -- --version
npm test
npm run build
```

Expected: Tauri CLI reports a 2.x version, 114 tests pass, and the frontend build exits successfully.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add project-local Tauri CLI"
```

### Task 2: Build and upload a Windows test installer

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run tauri:build`, the frontend and native verification jobs, and Tauri's NSIS bundler.
- Produces: a GitHub Actions artifact named `ai-usage-meter-windows-test-installer` containing the generated `.exe` installer.

- [ ] **Step 1: Add a workflow structure check**

Verify the final YAML contains one `windows-bundle` job with:

```yaml
needs: [frontend, native]
runs-on: windows-latest
```

and an artifact upload path of:

```yaml
src-tauri/target/release/bundle/nsis/*.exe
```

- [ ] **Step 2: Add the gated bundle job**

Append this job to `.github/workflows/ci.yml`:

```yaml
  windows-bundle:
    name: Windows test installer
    if: github.event_name == 'push'
    needs: [frontend, native]
    runs-on: windows-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.20.2
          cache: npm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust build
        uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install dependencies
        run: npm ci

      - name: Build NSIS installer
        run: npm run tauri:build -- --bundles nsis

      - name: Upload Windows test installer
        uses: actions/upload-artifact@v4
        with:
          name: ai-usage-meter-windows-test-installer
          path: src-tauri/target/release/bundle/nsis/*.exe
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 3: Validate the workflow locally**

Run:

```bash
npm test
npm run build
```

Inspect `.github/workflows/ci.yml` and confirm the bundle job runs only after both existing jobs succeed.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: produce Windows test installer artifact"
```

### Task 3: Add an evidence-based Windows test checklist

**Files:**
- Create: `docs/windows-test-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the uploaded NSIS artifact.
- Produces: exact download, installation, runtime, and reporting steps for the first Windows test.

- [ ] **Step 1: Create the checklist**

The checklist must require the tester to record pass/fail for:

```text
Installer opens
SmartScreen warning is identifiable as the expected unsigned-app warning
Application installs and launches
Frameless window renders
Drag, resize, minimize, maximize, restore, and close work
Closing hides to tray instead of terminating
Tray left-click and menu actions work
Seven-day chart renders and opens in a pop-out window
Navigation pages open without blank screens
Manual provider entry persists after restart
Launch-at-startup setting changes only when toggled
No visible browser or terminal window opens with the app
Uninstall removes the application
```

Include fields for Windows version, display scaling, result, screenshot, and notes.

- [ ] **Step 2: Document the artifact download path**

Add a `Windows test build` section to `README.md` explaining:

```text
GitHub > Actions > latest successful CI run > Artifacts > ai-usage-meter-windows-test-installer
```

State that this is an unsigned test build, not a production release.

- [ ] **Step 3: Check documentation links**

Run:

```bash
git diff --check
rg -n "windows-test-checklist|ai-usage-meter-windows-test-installer|unsigned" README.md docs/windows-test-checklist.md
```

Expected: all three concepts are present and `git diff --check` exits successfully.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/windows-test-checklist.md
git commit -m "docs: add Windows installer verification checklist"
```

### Task 4: Publish and gate the next feature milestone

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `docs/windows-test-checklist.md`
- Verify: GitHub Actions run and artifact

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a downloadable Windows test installer and an explicit go/no-go result for connector development.

- [ ] **Step 1: Run the full local verification**

Run:

```bash
npm test
npm run build
git diff --check
git status --short
```

Expected: 114 tests pass, the build exits successfully, no whitespace errors exist, and the working tree is clean.

- [ ] **Step 2: Publish the commits to `main`**

Upload the tested snapshot to `walladanger/AI-Usage-Meter` without modifying `walladanger/ember-studio-foundation`.

- [ ] **Step 3: Verify GitHub Actions and artifact evidence**

Require both of these before asking the user to install:

```text
Frontend checks: passed
Windows Tauri check: passed
Windows test installer: passed with a downloadable artifact
```

- [ ] **Step 4: Perform the manual Windows gate**

Download and install the artifact on Windows 11, complete `docs/windows-test-checklist.md`, and attach screenshots or error text for any failed item.

- [ ] **Step 5: Decide the next milestone**

If the checklist passes, proceed with the existing personal-subscription work in Tasks 9-11 of `docs/superpowers/plans/2026-09-03-ai-usage-meter-milestone-1.md` (loopback pairing, Chromium companion, and provider capability validation). If it fails, fix only the failed Windows behavior and repeat this gate before adding connector or API scope.
