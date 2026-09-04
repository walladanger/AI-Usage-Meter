import type { RefreshSummary } from '../../usage/usageStore';

export function refreshSummaryMessage(summary: RefreshSummary): string {
  if (summary.attempted === 0) {
    return 'No automatic source is available in this build. Use Sources to enter a manual value.';
  }
  if (summary.failed === 0) {
    return `Refreshed ${summary.succeeded} automatic ${summary.succeeded === 1 ? 'source' : 'sources'}.`;
  }
  return `Refreshed ${summary.succeeded} of ${summary.attempted} automatic sources; ${summary.failed} failed. Last good values were preserved.`;
}
