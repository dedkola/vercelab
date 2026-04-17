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
  onResetPanelSizesAction: () => void;
};

export function DashboardHeader({
  activeIcon,
  activeLabel,
  baseDomain,
  hostIp,
  loadAverageLabel,
  onCopyHostIpAction,
  onCopyBaseDomainAction,
  onResetPanelSizesAction,
}: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-linear-to-r from-background/98 via-muted/38 to-background/96 px-4 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3.5 py-1.5 text-sm font-semibold tracking-tight shadow-[0_16px_36px_-28px_rgba(15,23,42,0.35)]"
          type="button"
        >
          <span>Vercelab</span>
        </button>

        <Badge className="gap-1 border border-border/60 bg-muted/75 text-foreground shadow-[0_14px_30px_-24px_rgba(15,23,42,0.28)]">
          <Icon name={activeIcon} className="h-3.5 w-3.5" />
          {activeLabel}
        </Badge>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto text-xs text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/72 px-2.5 py-1 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.3)]">
          <span className="text-muted-foreground/70">Server LAN IP</span>
          <span className="font-medium text-foreground">{hostIp ?? "-"}</span>
          <Button
            type="button"
            aria-label="Copy server LAN IP"
            onClick={onCopyHostIpAction}
            variant="ghost"
            size="icon"
            className="h-5 w-5"
          >
            <Icon name="copy" className="h-3 w-3" />
          </Button>
        </span>
        <Separator orientation="vertical" className="hidden h-3 md:block" />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/72 px-2.5 py-1 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.3)]">
          <span className="text-muted-foreground/70">Traefik</span>
          <span className="font-medium text-foreground">{baseDomain}</span>
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
        <Separator orientation="vertical" className="hidden h-3 md:block" />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/72 px-2.5 py-1 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.3)]">
          <span className="text-muted-foreground/70">LA</span>
          <span className="font-medium text-foreground">
            {loadAverageLabel}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          aria-label="Reset panel sizes"
          onClick={onResetPanelSizesAction}
          variant="secondary"
          size="sm"
          className="h-8 px-3 text-[11px]"
        >
          Reset Panels
        </Button>
        <Button
          type="button"
          aria-label="Theme"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <Icon name="theme" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
