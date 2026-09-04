# AI Usage Meter Windows Test Checklist

Use this checklist with the unsigned Windows test installer produced by GitHub Actions. This is a verification build, not a production release.

## Test system

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Windows version | |
| Display resolution | |
| Display scaling | 100% / 125% / other: |
| Installer filename | |
| GitHub Actions run | |

## Download and installation

1. Open the repository's **Actions** page.
2. Open the latest successful **CI** run.
3. Under **Artifacts**, download `ai-usage-meter-windows-test-installer`.
4. Extract the downloaded ZIP before running the installer.
5. Confirm the installer came from `walladanger/AI-Usage-Meter`.
6. Because this test build is not code-signed, Windows SmartScreen may identify the publisher as unknown. Record the exact warning shown. Do not continue if the filename or download source is unexpected.

## Acceptance checks

Record `Pass`, `Fail`, or `Blocked` for every row. For a failure, include the visible error text and a screenshot when possible.

| Check | Result | Screenshot or error text | Notes |
|---|---|---|---|
| Installer opens | | | |
| SmartScreen warning, if shown, is clearly the expected unsigned-app warning | | | |
| Application installs | | | |
| Application launches without a browser or terminal window | | | |
| Frameless smoky-black main window renders correctly | | | |
| Window can be dragged | | | |
| Window can be resized from edges and corners | | | |
| Minimize works | | | |
| Maximize and restore work | | | |
| Close hides the app to the tray instead of terminating it | | | |
| Tray left-click opens or hides the compact panel | | | |
| Tray menu opens Dashboard | | | |
| Tray menu refresh action responds | | | |
| Tray menu opens Settings | | | |
| Tray menu Exit fully closes the app | | | |
| Overview provider cards render | | | |
| Seven-day usage chart renders | | | |
| Chart pop-out opens in a separate app window | | | |
| Overview, Refresh, Alerts, History, Sources, Settings, and Help open without blank screens | | | |
| Manual provider value can be entered | | | |
| Manual provider value remains after closing and reopening the app | | | |
| Launch-at-startup remains off until deliberately enabled | | | |
| Enabling and disabling launch-at-startup changes only when toggled | | | |
| App remains usable at the recorded display scaling | | | |
| Uninstaller opens and removes the application | | | |

## Final result

| Field | Value |
|---|---|
| Overall result | Pass / Fail / Blocked |
| Blocking checks | |
| Non-blocking issues | |
| Ready for connector development? | Yes / No |

Do not mark the build ready for connector development if installation, launch, tray lifecycle, persistence, or uninstall is `Fail` or `Blocked`.
