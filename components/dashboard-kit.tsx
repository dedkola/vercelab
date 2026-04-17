const STROKE_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.6,
};

export type IconName =
  | "bars"
  | "chevron-left"
  | "chevron-right"
  | "cloud"
  | "github"
  | "monitor"
  | "network"
  | "search"
  | "syslog";

type IconProps = {
  className?: string;
  name: IconName;
  title?: string;
};

function getIconContent(name: IconName) {
  switch (name) {
    case "bars":
      return (
        <path
          d="M6 18V14M10 18V9M14 18V11M18 18V7"
          {...STROKE_PROPS}
          strokeWidth={2}
        />
      );
    case "chevron-left":
      return <path d="M15 7l-5 5 5 5" {...STROKE_PROPS} />;
    case "chevron-right":
      return <path d="M9 7l5 5-5 5" {...STROKE_PROPS} />;
    case "cloud":
      return (
        <path
          d="M6 18h11a4 4 0 0 0 .5-7.97A7 7 0 0 0 5.2 14 3 3 0 0 0 6 18z"
          {...STROKE_PROPS}
        />
      );
    case "github":
      return (
        <>
          <path
            d="M9 19c-3.5 1-6-1.5-6-6.5A8.2 8.2 0 0 1 11.2 4c4.7 0 8.8 3.4 8.8 8.5 0 5-2.5 7.5-6 6.5"
            {...STROKE_PROPS}
          />
          <path
            d="M9 18c0-1.7-.1-2.7-1.1-3.3-2.5.3-3.1-1.2-3.3-1.9"
            {...STROKE_PROPS}
          />
          <path
            d="M15 18c0-1.7.1-2.7 1.1-3.3 2.5.3 3.1-1.2 3.3-1.9"
            {...STROKE_PROPS}
          />
          <path d="M9 9.8c.8-.5 1.8-.8 3-.8s2.2.3 3 .8" {...STROKE_PROPS} />
        </>
      );
    case "monitor":
      return (
        <>
          <rect x="5" y="5" width="14" height="10" rx="1.5" {...STROKE_PROPS} />
          <path d="M9 19h6M12 15v4" {...STROKE_PROPS} />
        </>
      );
    case "network":
      return (
        <>
          <circle cx="12" cy="12" r="8" {...STROKE_PROPS} />
          <circle cx="12" cy="12" r="3" {...STROKE_PROPS} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="10.5" cy="10.5" r="5" {...STROKE_PROPS} />
          <path d="M14.5 14.5l4.5 4.5" {...STROKE_PROPS} />
        </>
      );
    case "syslog":
      return (
        <>
          <path
            d="M7 4h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
            {...STROKE_PROPS}
          />
          <path d="M14 4v4h4" {...STROKE_PROPS} />
          <path d="M9 13h6M9 17h4" {...STROKE_PROPS} />
        </>
      );
  }
}

export function Icon({ name, className = "h-4 w-4", title }: IconProps) {
  const content = getIconContent(name);

  if (title) {
    return (
      <svg
        aria-label={title}
        className={className}
        role="img"
        viewBox="0 0 24 24"
      >
        <title>{title}</title>
        {content}
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      {content}
    </svg>
  );
}
