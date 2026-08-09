"use client";

import dynamic from "next/dynamic";

import type { ContainersData } from "@/lib/containers-data";

export const ContainersShell = dynamic<ContainersData>(
  () => import("@/components/containers-shell").then((m) => m.ContainersShell),
  { ssr: false },
);
