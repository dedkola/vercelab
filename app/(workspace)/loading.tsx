export default function WorkspaceLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading workspace page"
      className="min-w-0 flex-1 overflow-auto"
    >
      <div className="vercelab-page space-y-4" role="status">
        <span className="sr-only">Loading workspace page…</span>
        <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
          <div className="h-5 w-36 rounded bg-[var(--hairline)]" />
          <div className="h-20 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]" />
          <div className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
            <div className="h-12 border-b border-[var(--hairline)] bg-[var(--surface-subtle)]" />
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex h-14 items-center gap-3 border-b border-[var(--hairline)] px-3 last:border-0"
              >
                <div className="size-7 rounded-[6px] bg-[var(--canvas)]" />
                <div className="h-3 w-1/3 rounded bg-[var(--canvas)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
