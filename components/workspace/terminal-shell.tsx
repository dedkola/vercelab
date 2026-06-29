"use client";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import {
  Clipboard,
  ClipboardCheck,
  Minus,
  Plus,
  PlugZap,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  | { data: string; type: "error" | "output" }
  | { target: "container" | "host"; type: "ready" }
  | { exitCode: number; signal?: number; type: "exit" };

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const FONT_SIZES = [11, 12, 13, 14, 15, 16] as const;
const DEFAULT_FONT_SIZE = 13;

// Tokyo Night-inspired theme — rich, high-contrast, looks great with JetBrains Mono
const TERMINAL_THEME = {
  background: "#0d0f17",
  foreground: "#c0caf5",
  cursor: "#c0caf5",
  cursorAccent: "#0d0f17",
  selectionBackground: "#283457",
  black: "#15161e",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
};

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
  if (typeof data !== "string") return null;

  try {
    return JSON.parse(data) as TerminalMessage;
  } catch {
    return null;
  }
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        status === "connected" && "animate-pulse bg-emerald-400",
        status === "connecting" && "animate-pulse bg-amber-400",
        status === "disconnected" && "bg-zinc-500",
        status === "error" && "bg-red-500",
      )}
      aria-hidden="true"
    />
  );
}

export function TerminalShell() {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [host, setHost] = useState<TerminalHost | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const statusLabel: Record<ConnectionStatus, string> = {
    connected: "Connected",
    connecting: "Connecting…",
    disconnected: "Disconnected",
    error: "Connection error",
  };

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const webSocket = webSocketRef.current;

    if (!terminal || !fitAddon) return;

    fitAddon.fit();

    if (webSocket?.readyState === WebSocket.OPEN) {
      webSocket.send(
        JSON.stringify({ cols: terminal.cols, rows: terminal.rows, type: "resize" }),
      );
    }
  }, []);

  const connectTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    webSocketRef.current?.close();
    setConnectionStatus("connecting");
    terminal.clear();
    terminal.writeln("\x1b[90mOpening host terminal…\x1b[0m");

    const webSocket = new WebSocket(buildTerminalWebSocketUrl(host));
    webSocketRef.current = webSocket;

    webSocket.addEventListener("open", () => {
      setConnectionStatus("connected");
      terminal.focus();
      sendResize();
    });

    webSocket.addEventListener("message", (event) => {
      const message = parseTerminalMessage(event.data);
      if (!message) return;

      if (message.type === "output") terminal.write(message.data);
      if (message.type === "error") {
        terminal.writeln(`\r\n\x1b[31m${message.data}\x1b[0m`);
        setConnectionStatus("error");
      }
      if (message.type === "exit") {
        terminal.writeln("\r\n\x1b[90mSession closed.\x1b[0m");
        setConnectionStatus("disconnected");
      }
    });

    webSocket.addEventListener("close", () => {
      if (webSocketRef.current === webSocket) {
        setConnectionStatus((c) => (c === "error" ? c : "disconnected"));
      }
    });

    webSocket.addEventListener("error", () => {
      setConnectionStatus("error");
      terminal.writeln("\r\n\x1b[31mUnable to connect to the terminal server.\x1b[0m");
    });
  }, [host, sendResize]);

  // Load host info
  useEffect(() => {
    let isActive = true;

    async function loadHost() {
      try {
        const response = await fetch("/api/terminal/execute", { cache: "no-store" });
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as TerminalHostError) : null;

        if (!response.ok) throw new Error(payload?.error ?? "Unable to open host shell.");
        if (isActive) setHost(payload as TerminalHost);
      } catch (error) {
        if (!isActive) return;
        setConnectionStatus("error");
        terminalRef.current?.writeln(
          `\x1b[31m${error instanceof Error ? error.message : "Unable to open host shell."}\x1b[0m`,
        );
      }
    }

    void loadHost();
    return () => { isActive = false; };
  }, []);

  // Initialize xterm
  useEffect(() => {
    if (!terminalElementRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize,
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 10000,
      theme: TERMINAL_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(terminalElementRef.current);

    // Ctrl+L → clear
    terminal.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        terminal.clear();
        terminal.focus();
        return false;
      }
      return true;
    });

    terminal.onData((data) => {
      const ws = webSocketRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ data, type: "input" }));
      }
    });

    terminal.onSelectionChange(() => {
      setHasSelection(terminal.hasSelection());
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    sendResize();

    const resizeObserver = new ResizeObserver(() => sendResize());
    resizeObserver.observe(terminalElementRef.current);

    return () => {
      resizeObserver.disconnect();
      webSocketRef.current?.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sendResize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (host && terminalRef.current) connectTerminal();
  }, [connectTerminal, host]);

  // Sync font size changes into live terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    fitAddonRef.current?.fit();
    terminal.focus();
  }, [fontSize]);

  async function handleCopySelection() {
    const selection = terminalRef.current?.getSelection();
    if (!selection) return;
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
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      toast.success("Terminal output copied");
    } catch {
      toast.error("Unable to copy terminal output");
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0d0f17]">
      {/* Terminal header bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-zinc-900/80 px-3 py-2 backdrop-blur-sm">
        {/* Left — identity */}
        <div className="flex items-center gap-2.5">
          <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <span className="font-mono text-[11px] font-medium text-zinc-300 leading-none">
            {host ? `${host.username}@${host.hostname}` : "terminal"}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <StatusDot status={connectionStatus} />
            <span className="text-[10px] text-zinc-500 leading-none">
              {statusLabel[connectionStatus]}
            </span>
          </span>
        </div>

        {/* Right — controls */}
        <div className="flex items-center gap-1">
          {/* Font size */}
          <div className="flex items-center rounded border border-zinc-700/60 bg-zinc-800/60">
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(FONT_SIZES[0], s - 1))}
              disabled={fontSize <= FONT_SIZES[0]}
              className="flex h-6 w-6 items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors"
              title="Decrease font size"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="w-6 text-center font-mono text-[10px] text-zinc-400 leading-none select-none">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(FONT_SIZES[FONT_SIZES.length - 1], s + 1))}
              disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
              className="flex h-6 w-6 items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors"
              title="Increase font size"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-zinc-700/60" />

          {/* Copy selection */}
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50",
              !hasSelection && "opacity-40 pointer-events-none",
            )}
            onClick={handleCopySelection}
            title="Copy selection"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* Copy all output */}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50"
            onClick={handleCopyOutput}
            title="Copy all output"
          >
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* Clear */}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50"
            onClick={() => { terminalRef.current?.clear(); terminalRef.current?.focus(); }}
            title="Clear (Ctrl+L)"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* Reconnect — only shown when disconnected/error */}
          {(connectionStatus === "disconnected" || connectionStatus === "error") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[10px] font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 ring-1 ring-amber-500/30"
              onClick={connectTerminal}
              title="Reconnect"
            >
              <PlugZap className="h-3 w-3" aria-hidden="true" />
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* xterm canvas */}
      <div
        className="min-h-0 flex-1 overflow-hidden p-1"
        ref={terminalElementRef}
      />

      {/* Footer — host metadata */}
      <div className="flex shrink-0 items-center gap-4 border-t border-white/[0.06] bg-zinc-900/60 px-3 py-1.5">
        <span className="text-[10px] text-zinc-600">
          <span className="text-zinc-500">os</span>{" "}
          {host?.osName ?? "…"}
        </span>
        <span className="text-[10px] text-zinc-600">
          <span className="text-zinc-500">shell</span>{" "}
          <span className="font-mono">{host?.shell ?? "…"}</span>
        </span>
        <span className="text-[10px] text-zinc-600">
          <span className="text-zinc-500">target</span>{" "}
          {host?.target === "host" ? "Ubuntu host" : "container"}
        </span>
      </div>
    </div>
  );
}
