'use client';

type WorkspaceFooterProps = {
  activeViewLabel: string;
  updatedAtLabel: string;
};

export function WorkspaceFooter({ activeViewLabel, updatedAtLabel }: WorkspaceFooterProps) {
  return (
    <footer
      aria-label="Workspace footer"
      className="shrink-0 border-t border-[var(--hairline)] bg-[rgb(255_255_255_/_0.82)]"
    >
      <div className="mx-auto flex h-7 w-full max-w-[1680px] items-center justify-between gap-3 px-6 font-mono text-[8px] text-[var(--quiet)] max-[760px]:justify-end max-[760px]:px-3">
        <span className="max-[760px]:hidden">Vercelab / {activeViewLabel}</span>
        <span>Last sample {updatedAtLabel}</span>
      </div>
    </footer>
  );
}
