import { fixtureHistory } from '../../usage/fixtureUsage';
import type { UsageHistoryPoint } from '../../usage/usageTypes';
import { UsageTrendChart } from '../dashboard/UsageTrendChart';
import './usageChartWindow.css';

export interface UsageChartWindowProps {
  history?: UsageHistoryPoint[];
}

export function UsageChartWindow({ history = fixtureHistory }: UsageChartWindowProps) {
  return (
    <section className="usage-chart-window" aria-labelledby="usage-chart-window-title">
      <header>
        <div>
          <span className="usage-chart-window__eyebrow">Allowance history</span>
          <h1 id="usage-chart-window-title">Seven-day usage trend</h1>
          <p>Percentage of each provider allowance used per day.</p>
        </div>
        {history === fixtureHistory ? <span className="dashboard__preview-badge">Preview data</span> : null}
      </header>
      <div className="usage-chart-window__chart">
        <UsageTrendChart history={history} />
      </div>
    </section>
  );
}
