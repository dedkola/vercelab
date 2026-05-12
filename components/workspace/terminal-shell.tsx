"use client";

import { Play, Trash2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TerminalHost = {
  arch: string;
  cwd: string;
  hostname: string;
  osName: string;
  platform: string;
  shell: string;
  username: string;
};

type TerminalExecuteResponse = {
  clipped?: boolean;
  cwd?: string;
  durationMs?: number;
  error?: string;
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
};

type TerminalLine = {
  id: string;
  kind: "command" | "error" | "stderr" | "stdout" | "system";
  text: string;
};

const MAX_HISTORY_ITEMS = 80;

function createLine(kind: TerminalLine["kind"], text: string): TerminalLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    text,
  };
}

function getPrompt(host: TerminalHost | null, cwd: string) {
  const user = host?.username ?? "server";
  const hostname = host?.hostname ?? "host";

  return `${user}@${hostname}:${cwd}$`;
}

function normalizeOutput(value: string | undefined) {
  return value?.replace(/\s+$/g, "") ?? "";
}

export function TerminalShell() {
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [host, setHost] = useState<TerminalHost | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    createLine("system", "Opening host shell..."),
  ]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const prompt = useMemo(() => getPrompt(host, cwd || "~"), [cwd, host]);

  useEffect(() => {
    let isActive = true;

    async function loadHost() {
      try {
        const response = await fetch("/api/terminal/execute", {
          cache: "no-store",
        });
        const payload = (await response.json()) as TerminalHost;

        if (!response.ok) {
          throw new Error("Unable to open host shell.");
        }

        if (!isActive) {
          return;
        }

        setHost(payload);
        setCwd(payload.cwd);
        setLines([
          createLine(
            "system",
            `Connected to ${payload.username}@${payload.hostname} · ${payload.osName}`,
          ),
        ]);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLines([
          createLine(
            "error",
            error instanceof Error ? error.message : "Unable to open host shell.",
          ),
        ]);
      }
    }

    void loadHost();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
    });
  }, [lines]);

  async function runCommand(nextCommand: string) {
    const trimmedCommand = nextCommand.trim();

    if (!trimmedCommand || isRunning) {
      return;
    }

    if (trimmedCommand === "clear") {
      setCommand("");
      setLines([]);
      return;
    }

    setIsRunning(true);
    setCommand("");
    setHistory((current) =>
      [trimmedCommand, ...current.filter((item) => item !== trimmedCommand)].slice(
        0,
        MAX_HISTORY_ITEMS,
      ),
    );
    setHistoryIndex(null);
    setLines((current) => [
      ...current,
      createLine("command", `${prompt} ${trimmedCommand}`),
    ]);

    try {
      const response = await fetch("/api/terminal/execute", {
        body: JSON.stringify({
          command: nextCommand,
          cwd,
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as TerminalExecuteResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Command failed.");
      }

      if (payload.cwd) {
        setCwd(payload.cwd);
      }

      const stdout = normalizeOutput(payload.stdout);
      const stderr = normalizeOutput(payload.stderr);

      setLines((current) => [
        ...current,
        ...(stdout ? [createLine("stdout", stdout)] : []),
        ...(stderr ? [createLine("stderr", stderr)] : []),
        ...(payload.timedOut
          ? [createLine("error", "Command timed out after 30s.")]
          : []),
        ...(payload.clipped ? [createLine("system", "Output clipped.")] : []),
      ]);
    } catch (error) {
      setLines((current) => [
        ...current,
        createLine(
          "error",
          error instanceof Error ? error.message : "Command failed.",
        ),
      ]);
    } finally {
      setIsRunning(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCommand(command);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex =
        historyIndex === null
          ? 0
          : Math.min(historyIndex + 1, history.length - 1);
      const nextCommand = history[nextIndex];

      if (nextCommand) {
        setHistoryIndex(nextIndex);
        setCommand(nextCommand);
      }
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (historyIndex === null) {
        return;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex < 0) {
        setHistoryIndex(null);
        setCommand("");
        return;
      }

      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
    }
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden bg-background/70">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-border/70">
          <div
            ref={outputRef}
            className="min-h-0 flex-1 overflow-auto bg-zinc-950 px-4 py-4 font-mono text-[12px] leading-5 text-zinc-100 shadow-inner"
            onClick={() => inputRef.current?.focus()}
          >
            <div className="space-y-2">
              {lines.map((line) => (
                <pre
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    line.kind === "command" && "text-emerald-300",
                    line.kind === "stderr" && "text-amber-200",
                    line.kind === "error" && "text-red-300",
                    line.kind === "system" && "text-zinc-400",
                  )}
                  key={line.id}
                >
                  {line.text}
                </pre>
              ))}
            </div>
          </div>

          <form
            className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-[12px] text-zinc-100"
            onSubmit={handleSubmit}
          >
            <span className="max-w-[52%] shrink-0 truncate text-emerald-300">
              {prompt}
            </span>
            <input
              aria-label="Terminal command"
              autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent text-zinc-50 outline-none placeholder:text-zinc-600"
              disabled={isRunning || !cwd}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              spellCheck={false}
              value={command}
            />
            <Button
              aria-label="Run command"
              className="h-8 w-8 shrink-0 rounded-lg border-zinc-700 bg-zinc-900 px-0 text-zinc-100 hover:bg-zinc-800"
              disabled={isRunning || !cwd || command.trim().length === 0}
              size="icon"
              type="submit"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </form>
        </div>
      </main>

      <aside className="hidden w-72 shrink-0 flex-col border-l border-border/70 bg-background/88 lg:flex">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="text-xs font-semibold tracking-tight text-foreground">
            Host terminal
          </div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">
            {host ? `${host.username}@${host.hostname}` : "Connecting"}
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 text-xs">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              System
            </div>
            <div className="mt-1 leading-5 text-foreground">
              {host?.osName ?? "Loading"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              Path
            </div>
            <div className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
              {cwd || "..."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              Shell
            </div>
            <div className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
              {host?.shell ?? "..."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              Status
            </div>
            <div className="mt-1 text-foreground">
              {isRunning ? "Running" : cwd ? "Ready" : "Connecting"}
            </div>
          </div>
        </div>

        <div className="mt-auto border-t border-border/70 p-3">
          <Button
            className="w-full justify-center"
            onClick={() => setLines([])}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </aside>
    </div>
  );
}
