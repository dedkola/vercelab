"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Clipboard, PlugZap, RotateCcw, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type TerminalHost = {
  arch: string;
  cwd: string;
  hostname: string;
  osName: string;
  platform: string;
  shell: string;
  target?: "container" | "host";
  username: string;
};

type TerminalHostError = {
  error?: string;
};

type TerminalMessage =
    | {
  data: string;
  type: "error" | "output";
}
    | {
  target: "container" | "host";
  type: "ready";
}
    | {
  exitCode: number;
  signal?: number;
  type: "exit";
};

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

function buildTerminalWebSocketUrl(host: TerminalHost | null) {
  const configuredUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const url = new URL("/terminal/ws", window.location.href);

  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
  ) {
    url.port = process.env.NEXT_PUBLIC_TERMINAL_WS_PORT ?? "3001";
  }

  if (host?.cwd) {
    url.searchParams.set("cwd", host.cwd);
  }

  return url.toString();
}

function getTerminalBufferText(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
  }

  return lines.join("\n").trimEnd();
}

function parseTerminalMessage(data: MessageEvent["data"]) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as TerminalMessage;
  } catch {
    return null;
  }
}

export function TerminalShell() {
  const [connectionStatus, setConnectionStatus] =
      useState<ConnectionStatus>("connecting");
  const [host, setHost] = useState<TerminalHost | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const statusLabel = useMemo(() => {
    switch (connectionStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting";
      case "error":
        return "Connection error";
      case "disconnected":
        return "Disconnected";
    }
  }, [connectionStatus]);

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const webSocket = webSocketRef.current;

    if (!terminal || !fitAddon) {
      return;
    }

    fitAddon.fit();

    if (webSocket?.readyState === WebSocket.OPEN) {
      webSocket.send(
          JSON.stringify({
            cols: terminal.cols,
            rows: terminal.rows,
            type: "resize",
          }),
      );
    }
  }, []);

  const connectTerminal = useCallback(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    webSocketRef.current?.close();
    setConnectionStatus("connecting");
    terminal.clear();
    terminal.writeln("Opening host terminal...");

    const webSocket = new WebSocket(buildTerminalWebSocketUrl(host));

    webSocketRef.current = webSocket;

    webSocket.addEventListener("open", () => {
      setConnectionStatus("connected");
      terminal.focus();
      sendResize();
    });

    webSocket.addEventListener("message", (event) => {
      const message = parseTerminalMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === "output") {
        terminal.write(message.data);
      }

      if (message.type === "error") {
        terminal.writeln(`\r\n${message.data}`);
        setConnectionStatus("error");
      }

      if (message.type === "exit") {
        terminal.writeln("\r\nSession closed.");
        setConnectionStatus("disconnected");
      }
    });

    webSocket.addEventListener("close", () => {
      if (webSocketRef.current === webSocket) {
        setConnectionStatus((current) =>
            current === "error" ? current : "disconnected",
        );
      }
    });

    webSocket.addEventListener("error", () => {
      setConnectionStatus("error");
      terminal.writeln("\r\nUnable to connect to the terminal server.");
    });
  }, [host, sendResize]);

  useEffect(() => {
    let isActive = true;

    async function loadHost() {
      try {
        const response = await fetch("/api/terminal/execute", {
          cache: "no-store",
        });
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as TerminalHostError) : null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to open host shell.");
        }

        if (isActive) {
          setHost(payload as TerminalHost);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setConnectionStatus("error");
        terminalRef.current?.writeln(
            error instanceof Error ? error.message : "Unable to open host shell.",
        );
      }
    }

    void loadHost();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!terminalElementRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily:
          'var(--font-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#09090b",
        black: "#18181b",
        blue: "#60a5fa",
        brightBlack: "#71717a",
        brightBlue: "#93c5fd",
        brightCyan: "#67e8f9",
        brightGreen: "#6ee7b7",
        brightMagenta: "#f0abfc",
        brightRed: "#fca5a5",
        brightWhite: "#f4f4f5",
        brightYellow: "#fde68a",
        cyan: "#22d3ee",
        foreground: "#f4f4f5",
        green: "#34d399",
        magenta: "#e879f9",
        red: "#f87171",
        selectionBackground: "#155e75",
        white: "#e4e4e7",
        yellow: "#facc15",
      },
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(terminalElementRef.current);
    terminal.onData((data) => {
      const webSocket = webSocketRef.current;

      if (webSocket?.readyState === WebSocket.OPEN) {
        webSocket.send(
            JSON.stringify({
              data,
              type: "input",
            }),
        );
      }
    });
    terminal.onSelectionChange(() => {
      setHasSelection(terminal.hasSelection());
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    sendResize();

    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });

    resizeObserver.observe(terminalElementRef.current);

    return () => {
      resizeObserver.disconnect();
      webSocketRef.current?.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sendResize]);

  useEffect(() => {
    if (host && terminalRef.current) {
      connectTerminal();
    }
  }, [connectTerminal, host]);

  async function handleCopySelection() {
    const terminal = terminalRef.current;
    const selection = terminal?.getSelection();

    if (!selection) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selection);
      toast.success("Selection copied");
    } catch {
      toast.error("Unable to copy selection");
    }
  }

  async function handleCopyOutput() {
    const terminal = terminalRef.current;
    const output = terminal ? getTerminalBufferText(terminal) : "";

    if (!output) {
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      toast.success("Terminal output copied");
    } catch {
      toast.error("Unable to copy terminal output");
    }
  }

  return (
      <div className="flex min-w-0 flex-1 overflow-hidden bg-background/70">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col border-r border-border/70 bg-zinc-950">
            <div
                className="min-h-0 flex-1 overflow-hidden px-3 py-3"
                ref={terminalElementRef}
            />
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
                Shell
              </div>
              <div className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
                {host?.shell ?? "..."}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">
                Target
              </div>
              <div className="mt-1 text-foreground">
                {host?.target === "host" ? "Ubuntu host" : "Current process"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">
                Status
              </div>
              <div className="mt-1 text-foreground">{statusLabel}</div>
            </div>
          </div>

          <div className="mt-auto space-y-2 border-t border-border/70 p-3">
            <Button
                className="w-full justify-center"
                disabled={!hasSelection}
                onClick={handleCopySelection}
                size="sm"
                type="button"
                variant="secondary"
            >
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
              Copy selection
            </Button>
            <Button
                className="w-full justify-center"
                onClick={handleCopyOutput}
                size="sm"
                type="button"
                variant="secondary"
            >
              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
              Copy output
            </Button>
            <Button
                className="w-full justify-center"
                onClick={connectTerminal}
                size="sm"
                type="button"
                variant="secondary"
            >
              <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
              Reconnect
            </Button>
            <Button
                className="w-full justify-center"
                onClick={() => terminalRef.current?.clear()}
                size="sm"
                type="button"
                variant="secondary"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </Button>
            <Button
                className="w-full justify-center"
                onClick={sendResize}
                size="sm"
                type="button"
                variant="secondary"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Fit
            </Button>
          </div>
        </aside>
      </div>
  );
}
