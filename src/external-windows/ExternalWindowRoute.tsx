import { createContext, useContext, type ReactNode } from 'react';
import { TitleBar } from '../shell/TitleBar';
import type { FeatureDescriptor } from '../windows/windowTypes';

const ExternalWindowHostContext = createContext(false);

export function injectedExternalFeatureId(browserWindow: Window): string | undefined {
  const value = (browserWindow as Window & { __AI_USAGE_METER_EXTERNAL_FEATURE__?: unknown }).__AI_USAGE_METER_EXTERNAL_FEATURE__;
  return typeof value === 'string' ? value : undefined;
}

export function selectExternalFeature(search: string, registry: Readonly<Record<string, FeatureDescriptor>>, injectedFeatureId?: string): FeatureDescriptor | null {
  const query = new URLSearchParams(search);
  const featureId = injectedFeatureId ?? (query.get('window') === 'external' ? query.get('feature') ?? '' : '');
  if (!featureId) return null;
  const feature = registry[featureId];
  return feature && feature.presentation !== 'internal' && (feature.ExternalContent ?? feature.InternalContent) ? feature : null;
}

export function useExternalWindowHost(): boolean { return useContext(ExternalWindowHostContext); }

export interface ExternalWindowRouteProps { feature: FeatureDescriptor; children?: ReactNode; }

export function ExternalWindowRoute({ feature, children }: ExternalWindowRouteProps) {
  const Content = feature.ExternalContent ?? feature.InternalContent;
  const compactPanel = feature.id === 'tray-panel';
  return <ExternalWindowHostContext.Provider value>
    <div className="external-window-host" data-feature-id={feature.id} data-compact-panel={compactPanel || undefined}>
      {compactPanel ? null : <TitleBar />}
      <main className="external-window-host__content">{children ?? (Content ? <Content /> : null)}</main>
    </div>
  </ExternalWindowHostContext.Provider>;
}
