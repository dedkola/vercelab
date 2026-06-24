import type { Metadata } from "next";

import { TerminalShell } from "@/components/workspace/terminal-shell";

export const metadata: Metadata = {
  title: "Terminal | Vercelab",
  description: "Host terminal for the server running Vercelab.",
};

export const dynamic = "force-dynamic";

export default function TerminalPage() {
  return <TerminalShell />;
}
