import { Bell, CircleHelp, Database, History, House, RefreshCw, Settings } from 'lucide-react';
import type { NavigationRegistry } from './navigationTypes';

export const navigationRegistry: NavigationRegistry = [
  { id: 'overview', label: 'Overview', icon: House, route: 'overview' },
  { id: 'refresh', label: 'Refresh', icon: RefreshCw, route: 'refresh' },
  { id: 'alerts', label: 'Alerts', icon: Bell, route: 'alerts' },
  { id: 'history', label: 'History', icon: History, route: 'history' },
  { id: 'sources', label: 'Sources', icon: Database, route: 'sources' },
  { id: 'settings', label: 'Settings', icon: Settings, route: 'settings' },
  { id: 'help', label: 'Help', icon: CircleHelp, route: 'help' },
];
