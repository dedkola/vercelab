import type { GitHubRepository } from '@/lib/github';
import type { DeploymentSummary } from '@/lib/persistence';
import type { ContainerStats } from '@/lib/system-metrics';
import type { ExposureMode } from '@/lib/validation';

type MetricTone = 'emerald' | 'amber' | 'slate';
export type PreviewContainerStatus = 'running' | 'degraded' | 'idle';
export type DashboardLogView = 'live' | 'events' | 'alerts';
export type WorkspaceView = 'dashboard' | 'git-app-page' | 'dev' | 'containers' | 'terminal';

export type MetricCard = {
  title: string;
  value: string;
  caption: string;
  delta: string;
  points: number[];
  tone: MetricTone;
};

type ContainerSignal = {
  label: string;
  value: string;
  delta: string;
  caption: string;
  tone: MetricTone;
  points: number[];
};

type Endpoint = {
  name: string;
  latency: string;
  uptime: string;
  load: number;
  url?: string;
};

export type LogLine = {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning';
  message: string;
};

export type PreviewContainer = {
  id: string;
  name: string;
  stack: string;
  image: string;
  node: string;
  status: PreviewContainerStatus;
  summary: string;
  uptime: string;
  port: string;
  cpu: string;
  memory: string;
  restarts: number;
  requestRate: string;
  region: string;
  deployedAt: string;
  tags: string[];
  volumes: string[];
  environment: Array<{ key: string; value: string }>;
  endpoints: Endpoint[];
  activity: number[];
  signals: ContainerSignal[];
  timeline: Array<{ label: string; detail: string }>;
  logs: Record<DashboardLogView, LogLine[]>;
};

export type ContainerListEntry = {
  deploymentStatus: DeploymentSummary['status'] | null;
  display: PreviewContainer;
  dotClassName: string;
  runtime: ContainerStats | null;
  sidebarName: string;
  sidebarSecondaryLabel: string;
  searchText: string;
};

export type DraftAppState = {
  appName: string;
  branch: string;
  exposureMode: ExposureMode;
  hostPort: string;
  port: string;
  repositoryUrl: string;
  subdomain: string;
};

export type RepositoryState = {
  error: string | null;
  hasLoaded: boolean;
  isLoading: boolean;
  repositories: GitHubRepository[];
  tokenConfigured: boolean;
};
