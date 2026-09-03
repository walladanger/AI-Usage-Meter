import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { UsageHistoryPoint } from '../../usage/usageTypes';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export interface UsageTrendChartProps {
  history: UsageHistoryPoint[];
}

const labels = {
  openai: 'ChatGPT / Codex',
  anthropic: 'Claude / Claude Code',
  google: 'Gemini',
} as const;

const colors = {
  openai: '#4db866',
  anthropic: '#f28a21',
  google: '#2f7ee6',
} as const;

export function UsageTrendChart({ history }: UsageTrendChartProps) {
  const option: EChartsCoreOption = {
    animation: false,
    backgroundColor: 'transparent',
    color: [colors.openai, colors.anthropic, colors.google],
    textStyle: { color: '#a3a3a3', fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { left: 50, right: 18, top: 24, bottom: 54 },
    tooltip: { trigger: 'axis', backgroundColor: '#171d23', borderColor: '#35414b', textStyle: { color: '#f5f5f5' } },
    legend: { bottom: 0, textStyle: { color: '#c4cbd2' } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: history.map((point) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(point.observedAt))),
      axisLine: { lineStyle: { color: '#35414b' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', min: 0, max: 100, interval: 25,
      axisLabel: { formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#27313a' } },
    },
    series: (Object.keys(labels) as Array<keyof typeof labels>).map((providerId) => ({
      name: labels[providerId],
      type: 'line',
      smooth: false,
      symbolSize: 8,
      lineStyle: { width: 2 },
      data: history.map((point) => point[providerId] ?? null),
    })),
  };

  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate className="usage-trend__canvas" />;
}
