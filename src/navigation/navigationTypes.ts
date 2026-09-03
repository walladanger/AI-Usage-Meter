import type { LucideIcon } from 'lucide-react';

export type ShellRoute = 'overview' | 'refresh' | 'alerts' | 'history' | 'sources' | 'settings' | 'help';

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: ShellRoute;
  shortcut?: string;
  visible?: boolean;
}

export type NavigationRegistry = readonly NavigationItem[];
