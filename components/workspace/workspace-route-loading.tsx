type WorkspaceRouteLoadingShellProps = {
  description: string;
  label: string;
  title: string;
};

function LoadingLine({ className }: { className: string }) {
  return <div className={`${className} animate-pulse rounded-full bg-muted/70`} />;
}

function LoadingCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-[1.5rem] border border-border/70 bg-background/88 p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.3)] ${className}`.trim()}
    >
      <LoadingLine className="h-3 w-20" />
      <LoadingLine className="mt-4 h-7 w-40" />
      <LoadingLine className="mt-3 h-3.5 w-full max-w-md" />
      <LoadingLine className="mt-2 h-3.5 w-full max-w-sm" />
    </div>
  );
}

export function WorkspaceRouteLoadingShell({
  description,
  label,
  title,
}: WorkspaceRouteLoadingShellProps) {
  return (
    <section
      aria-busy="true"
      aria-label={`${title} loading`}
      className="flex h-screen flex-col bg-linear-to-b from-background via-muted/12 to-background"
    >
      <p className="sr-only">Loading {title}.</p>

      <header className="border-b border-border/70 bg-background/88 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <LoadingLine className="h-3 w-24" />
            <LoadingLine className="h-7 w-48" />
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <LoadingLine className="h-9 w-24" />
            <LoadingLine className="h-9 w-24" />
          </div>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <aside className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-border/70 bg-linear-to-b from-background via-muted/22 to-background px-2 py-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <LoadingLine className="h-10 w-10 rounded-2xl" key={index} />
          ))}
        </aside>

        <aside className="hidden w-[18rem] shrink-0 border-r border-border/70 bg-background/72 p-4 lg:block">
          <LoadingLine className="h-4 w-32" />
          <LoadingLine className="mt-4 h-10 w-full rounded-2xl" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <LoadingLine className="h-16 w-full rounded-[1.25rem]" key={index} />
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-linear-to-b from-background/72 via-muted/14 to-background p-4 md:p-5">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            <div className="rounded-[1.75rem] border border-border/70 bg-background/86 p-6 shadow-[0_28px_72px_-48px_rgba(15,23,42,0.3)]">
              <div className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                {label}
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
              <div className="space-y-4">
                <LoadingCard />
                <LoadingCard />
                <LoadingCard className="min-h-72" />
              </div>

              <div className="space-y-4">
                <LoadingCard />
                <LoadingCard className="min-h-80" />
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden w-[20rem] shrink-0 border-l border-border/70 bg-background/72 p-4 xl:block">
          <LoadingLine className="h-4 w-28" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <LoadingLine className="h-14 w-full rounded-[1.25rem]" key={index} />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
