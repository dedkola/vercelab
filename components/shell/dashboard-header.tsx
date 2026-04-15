"use client";

import { Icon, type IconName } from "@/components/dashboard-kit";

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
    <header className="topbar">
      <div className="topbar__left">
        <button className="site-switch" type="button">
          <span className="site-switch__dot" />
          <span className="site-switch__name">Vercelab</span>
        </button>

        <span className="app-pill">
          <Icon name={activeIcon} />
          {activeLabel}
        </span>
      </div>

      <div className="topbar__center">
        <div className="header-sysinfo">
          <span className="header-sysinfo__item">
            <span className="header-sysinfo__label">Host IP</span>
            <span className="header-sysinfo__value">{hostIp ?? "-"}</span>
            <button
              className="header-sysinfo__copy"
              type="button"
              aria-label="Copy host IP"
              onClick={onCopyHostIpAction}
            >
              <Icon name="copy" />
            </button>
          </span>
          <span className="header-sysinfo__sep" />
          <span className="header-sysinfo__item">
            <span className="header-sysinfo__label">Traefik</span>
            <span className="header-sysinfo__value">{baseDomain}</span>
            <button
              className="header-sysinfo__copy"
              type="button"
              aria-label="Copy traefik hostname"
              onClick={onCopyBaseDomainAction}
            >
              <Icon name="copy" />
            </button>
          </span>
          <span className="header-sysinfo__sep" />
          <span className="header-sysinfo__item">
            <span className="header-sysinfo__label">LA</span>
            <span className="header-sysinfo__value">{loadAverageLabel}</span>
          </span>
        </div>
      </div>

      <div className="topbar__right">
        <button className="topbar-btn" type="button" aria-label="Theme">
          <Icon name="theme" />
        </button>
        <button className="topbar-avatar" type="button" aria-label="Profile">
          <Icon name="profile" />
        </button>
      </div>
    </header>
  );
}
