export type IconName =
  | "dashboard"
  | "topology"
  | "devices"
  | "clients"
  | "ports"
  | "airview"
  | "insights"
  | "settings"
  | "syslog"
  | "integrations"
  | "alarm"
  | "innerspace"
  | "admins"
  | "network"
  | "theme"
  | "profile"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "globe"
  | "copy"
  | "search"
  | "check"
  | "bars"
  | "arrow-down"
  | "arrow-up"
  | "gateway"
  | "switch-device"
  | "ap"
  | "client-device"
  | "wifi"
  | "shield"
  | "speed-test"
  | "wifi-doctor"
  | "layout-grid"
  | "notifications"
  | "monitor"
  | "gamepad"
  | "chat"
  | "film"
  | "cloud"
  | "headphones";

type IconProps = {
  name: IconName;
  className?: string;
  title?: string;
};

export function Icon({ name, className = "icon", title }: IconProps) {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
  };

  const content = (() => {
    switch (name) {
      case "dashboard":
        return (
          <>
            <path d="M5 16a7 7 0 0 1 14 0" {...s} />
            <path d="M12 12.5l3-3" {...s} />
            <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
          </>
        );
      case "topology":
        return (
          <>
            <circle cx="7" cy="7" r="2" {...s} />
            <circle cx="17" cy="7" r="2" {...s} />
            <circle cx="12" cy="17" r="2" {...s} />
            <path d="M8.5 8.5l2 5.5M15.5 8.5l-2 5.5M9 7h6" {...s} />
          </>
        );
      case "devices":
        return (
          <>
            <rect x="4" y="5" width="16" height="11" rx="2" {...s} />
            <path d="M8 20h8M12 16v4" {...s} />
          </>
        );
      case "clients":
        return (
          <>
            <circle cx="9" cy="9" r="2.5" {...s} />
            <path d="M4 19c1-3 3-4.5 5-4.5s4 1.5 5 4.5" {...s} />
            <circle cx="16" cy="10" r="2" {...s} />
            <path d="M15 19c.5-2 1.5-3 3-3 1.2 0 2.2.6 2.8 1.5" {...s} />
          </>
        );
      case "ports":
        return (
          <>
            <rect x="4" y="5" width="16" height="14" rx="2" {...s} />
            <path d="M8 9v6M12 9v6M16 9v6" {...s} />
          </>
        );
      case "airview":
        return (
          <>
            <path d="M12 18h.01" {...s} strokeWidth={2} />
            <path d="M8.5 14.5a5 5 0 0 1 7 0" {...s} />
            <path d="M5.5 11.5a9 9 0 0 1 13 0" {...s} />
            <path d="M3 8.5a13 13 0 0 1 18 0" {...s} />
          </>
        );
      case "insights":
        return (
          <>
            <path d="M4 19h16" {...s} />
            <path d="M4 19V5" {...s} />
            <path d="M7 15l3.5-4 3 2.5L18 8" {...s} />
          </>
        );
      case "settings":
        return (
          <>
            <circle cx="12" cy="12" r="3" {...s} />
            <path
              d="M12 4v2M12 18v2M4.9 7.1l1.4 1.4M17.7 15.5l1.4 1.4M4 12h2M18 12h2M4.9 16.9l1.4-1.4M17.7 8.5l1.4-1.4"
              {...s}
            />
          </>
        );
      case "syslog":
        return (
          <>
            <path
              d="M7 4h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
              {...s}
            />
            <path d="M14 4v4h4" {...s} />
            <path d="M9 13h6M9 17h4" {...s} />
          </>
        );
      case "integrations":
        return (
          <>
            <rect x="3" y="8" width="6" height="8" rx="1.5" {...s} />
            <rect x="15" y="5" width="6" height="5.5" rx="1.5" {...s} />
            <rect x="15" y="13.5" width="6" height="5.5" rx="1.5" {...s} />
            <path d="M9 12h6M15 12V8M15 12v3.5" {...s} />
          </>
        );
      case "alarm":
        return (
          <>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...s} />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" {...s} />
          </>
        );
      case "innerspace":
        return (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" {...s} />
            <path d="M3 9h18M9 3v18" {...s} />
          </>
        );
      case "admins":
        return (
          <>
            <circle cx="8" cy="8" r="2" {...s} />
            <circle cx="16" cy="8" r="2" {...s} />
            <path d="M4 18c.7-2.5 2.3-3.5 4-3.5s3.3 1 4 3.5" {...s} />
            <path d="M12 18c.7-2.5 2.3-3.5 4-3.5s3.3 1 4 3.5" {...s} />
          </>
        );
      case "network":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...s} />
            <circle cx="12" cy="12" r="3" {...s} />
          </>
        );
      case "theme":
        return (
          <>
            <circle cx="12" cy="12" r="7" {...s} />
            <path d="M12 5a7 7 0 0 1 0 14" fill="currentColor" stroke="none" />
          </>
        );
      case "profile":
        return (
          <>
            <circle cx="12" cy="9" r="3" {...s} />
            <path d="M6 20c1-3.5 3-5 6-5s5 1.5 6 5" {...s} />
          </>
        );
      case "chevron-down":
        return <path d="M7 10l5 4 5-4" {...s} />;
      case "chevron-left":
        return <path d="M15 7l-5 5 5 5" {...s} />;
      case "chevron-right":
        return <path d="M9 7l5 5-5 5" {...s} />;
      case "globe":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...s} />
            <path d="M4 12h16" {...s} />
            <path
              d="M12 4c2.5 2.5 3.5 5 3.5 8s-1 5.5-3.5 8c-2.5-2.5-3.5-5-3.5-8s1-5.5 3.5-8"
              {...s}
            />
          </>
        );
      case "copy":
        return (
          <>
            <rect x="8" y="8" width="10" height="12" rx="1.5" {...s} />
            <path d="M6 16V5.5A1.5 1.5 0 0 1 7.5 4H15" {...s} />
          </>
        );
      case "search":
        return (
          <>
            <circle cx="10.5" cy="10.5" r="5" {...s} />
            <path d="M14.5 14.5l4.5 4.5" {...s} />
          </>
        );
      case "check":
        return <path d="M5 12l5 5L20 7" {...s} />;
      case "bars":
        return (
          <path d="M6 18V14M10 18V9M14 18V11M18 18V7" {...s} strokeWidth={2} />
        );
      case "arrow-down":
        return <path d="M12 5v14M8 15l4 4 4-4" {...s} />;
      case "arrow-up":
        return <path d="M12 19V5M8 9l4-4 4 4" {...s} />;
      case "gateway":
        return (
          <>
            <rect x="3" y="8" width="18" height="8" rx="2" {...s} />
            <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
            <path d="M12 12h6" {...s} />
            <path d="M8 5l4 3 4-3" {...s} />
          </>
        );
      case "switch-device":
        return (
          <>
            <rect x="3" y="7" width="18" height="10" rx="2" {...s} />
            <path d="M7 11v2M10 10v3M13 11v2M16 10v3" {...s} />
          </>
        );
      case "ap":
        return (
          <>
            <circle cx="12" cy="14" r="3.5" {...s} />
            <path d="M8 9.5a6 6 0 0 1 8 0" {...s} />
            <path d="M5.5 6.5a10 10 0 0 1 13 0" {...s} />
          </>
        );
      case "client-device":
        return (
          <>
            <rect x="5" y="5" width="14" height="10" rx="1.5" {...s} />
            <path d="M9 19h6M12 15v4" {...s} />
          </>
        );
      case "wifi":
        return (
          <>
            <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
            <path d="M8.5 14.5a5 5 0 0 1 7 0" {...s} />
            <path d="M5 11a10 10 0 0 1 14 0" {...s} />
          </>
        );
      case "shield":
        return (
          <path
            d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z"
            {...s}
          />
        );
      case "speed-test":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...s} />
            <path d="M12 8v4l2.5 2.5" {...s} />
          </>
        );
      case "wifi-doctor":
        return (
          <>
            <path d="M8.5 15a5 5 0 0 1 7 0" {...s} />
            <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
            <path d="M5 12a10 10 0 0 1 14 0" {...s} />
            <path d="M18 4v5M15.5 6.5h5" {...s} />
          </>
        );
      case "layout-grid":
        return (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" {...s} />
            <rect x="14" y="3" width="7" height="7" rx="1" {...s} />
            <rect x="3" y="14" width="7" height="7" rx="1" {...s} />
            <rect x="14" y="14" width="7" height="7" rx="1" {...s} />
          </>
        );
      case "notifications":
        return (
          <>
            <circle cx="10.5" cy="10.5" r="5" {...s} />
            <path d="M14.5 14.5l4.5 4.5" {...s} />
          </>
        );
      case "monitor":
        return (
          <>
            <rect x="5" y="5" width="14" height="10" rx="1.5" {...s} />
            <path d="M9 19h6M12 15v4" {...s} />
          </>
        );
      case "gamepad":
        return (
          <>
            <rect x="4" y="7" width="16" height="10" rx="3" {...s} />
            <path d="M9 10v4M7 12h4" {...s} />
            <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
          </>
        );
      case "chat":
        return (
          <>
            <path
              d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3V6z"
              {...s}
            />
            <path d="M8 9h8M8 13h5" {...s} />
          </>
        );
      case "film":
        return (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" {...s} />
            <path d="M4 8h16M4 16h16M8 4v16M16 4v16" {...s} />
          </>
        );
      case "cloud":
        return (
          <path
            d="M6 18h11a4 4 0 0 0 .5-7.97A7 7 0 0 0 5.2 14 3 3 0 0 0 6 18z"
            {...s}
          />
        );
      case "headphones":
        return (
          <>
            <path d="M3 14v-2a9 9 0 0 1 18 0v2" {...s} />
            <rect x="3" y="14" width="4" height="5" rx="1" {...s} />
            <rect x="17" y="14" width="4" height="5" rx="1" {...s} />
          </>
        );
      default:
        return <circle cx="12" cy="12" r="6" {...s} />;
    }
  })();

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden={!title}
      {...(title ? { role: "img", "aria-label": title } : {})}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}
