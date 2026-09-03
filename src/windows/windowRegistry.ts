import { DataExplorerWindow } from './DataExplorerWindow';
import { UsageChartWindow } from '../features/history/UsageChartWindow';
import { TrayPanelWindow } from '../features/tray/TrayPanelWindow';
import type { FeatureDescriptor } from './windowTypes';

export const windowRegistry: Readonly<Record<string, FeatureDescriptor>> = {
  'tray-panel': {
    id: 'tray-panel',
    title: 'AI Usage Meter',
    presentation: 'external',
    initialBounds: { x: 96, y: 72, width: 380, height: 440 },
    minimum: { width: 340, height: 380 },
    preserveState: true,
    ExternalContent: TrayPanelWindow,
  },
  'usage-trend': {
    id: 'usage-trend',
    title: 'AI Usage Meter — Seven-day usage trend',
    presentation: 'external',
    initialBounds: { x: 96, y: 72, width: 980, height: 640 },
    minimum: { width: 640, height: 420 },
    preserveState: true,
    ExternalContent: UsageChartWindow,
  },
  'data-explorer': {
    id: 'data-explorer',
    title: 'Data Explorer',
    presentation: 'dual',
    initialBounds: { x: 80, y: 56, width: 720, height: 480 },
    minimum: { width: 360, height: 240 },
    preserveState: true,
    InternalContent: DataExplorerWindow,
  },
};
