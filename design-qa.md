# Design QA — Approved Image 1

Date: 2026-09-03

## Reference

`docs/screenshots/ai-usage-meter-dashboard-approved.png` at 1440 × 1024.

## Automated evidence

- Dashboard, shell, navigation, chart pop-out, setup, sources, settings, alerts, history, and tray component tests pass.
- Production TypeScript/Vite build passes.
- Approved structural changes are represented in code: unboxed sidebar toggle, no bottom collapse action, no top summary strip, no recent-activity panel, full-width seven-day chart, and chart pop-out action.

## Browser inspection

The production preview started successfully on the local workspace at port 4173. The cloud QA browser could not reach the workspace forwarding hostname and returned `ERR_CONNECTION_REFUSED`; an earlier development-port attempt was blocked by the browser client. No screenshot comparison or responsive viewport inspection could therefore be completed in this environment.

## Required follow-up

- Inspect Overview at 1440 × 1024 against the approved reference.
- Inspect collapsed navigation and widths at 1180, 960, and 900 pixels.
- Open the seven-day chart pop-out and compact tray window on Windows 11.
- Check keyboard focus, overflow, chart resizing, and system scaling at 100% and 125%.

Final result: blocked — remote browser could not connect to the local preview.
