"use client";

import dynamic from "next/dynamic";

import type { WorkspaceShellData } from "@/lib/workspace-shell-data";

export const WorkspaceShell = dynamic<
  WorkspaceShellData & { embedded?: boolean }
>(
  () => import("@/components/workspace-shell").then((m) => m.WorkspaceShell),
  { ssr: false },
);
