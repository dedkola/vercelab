"use client";

import { Icon, type IconName } from "@/components/dashboard-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type DashboardHeaderProps = {
  activeIcon: IconName;
  activeLabel: string;
  baseDomain: string;
  hostIp?: string;
  loadAverageLabel: string;
  onCopyHostIpAction: () => void;
  onCopyBaseDomainAction: () => void;
};

export function DashboardHeader({
  activeIcon,
  activeLabel,
  baseDomain,
  hostIp,
  loadAverageLabel,
  onCopyHostIpAction,
  onCopyBaseDomainAction,
}: DashboardHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 px-3">
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-1.5 text-sm font-medium"
          type="button"
        >
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>Vercelab</span>
        </button>

        <Badge className="gap-1">
          <Icon name={activeIcon} className="h-3.5 w-3.5" />
          {activeLabel}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-400">Host IP</span>
          <span className="font-medium text-zinc-700">{hostIp ?? "-"}</span>
          <Button
            type="button"
            aria-label="Copy host IP"
            onClick={onCopyHostIpAction}
            variant="ghost"
            size="icon"
            className="h-5 w-5"
          >
            <Icon name="copy" className="h-3 w-3" />
          </Button>
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-400">Traefik</span>
          <span className="font-medium text-zinc-700">{baseDomain}</span>
          <Button
            type="button"
            aria-label="Copy traefik hostname"
            onClick={onCopyBaseDomainAction}
            variant="ghost"
            size="icon"
            className="h-5 w-5"
          >
            <Icon name="copy" className="h-3 w-3" />
          </Button>
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-400">LA</span>
          <span className="font-medium text-zinc-700">{loadAverageLabel}</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          aria-label="Theme"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <Icon name="theme" className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          aria-label="Profile"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <Icon name="profile" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
