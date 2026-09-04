'use client';

import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import {
  ClipboardText as Clipboard,
  Copy as ClipboardCheck,
  Minus,
  Plus,
  Plug as PlugZap,
  TerminalWindow as TerminalSquare,
  Trash as Trash2,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TerminalHost = {
  arch: string;
  cwd: string;
  hostname: string;
  osName: string;
  platform: string;
  shell: string;
  target?: 'container' | 'host';
  username: string;
};

type TerminalHostError = {
  error?: string;
};

type TerminalMessage =
  | { data: string; type: 'error' | 'output' }
  | { target: 'container' | 'host'; type: 'ready' }
  | { exitCode: number; signal?: number; type: 'exit' };

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const FONT_SIZES = [11, 12, 13, 14, 15, 16] as const;
const DEFAULT_FONT_SIZE = 13;

// Keep the terminal palette aligned with the workspace's light surfaces.
const TERMINAL_THEME = {
  background: '#fafafa',
  foreground: '#1a1a1d',
  cursor: '#0f61d8',
  cursorAccent: '#ffffff',
  selectionBackground: '#d6e6fc',
  black: '#1a1a1d',
  red: '#c73737',
  green: '#16864b',
  yellow: '#9a4c0b',
  blue: '#0f61d8',
  magenta: '#7259c9',
  cyan: '#167485',
  white: '#686a70',
  brightBlack: '#686a70',
  brightRed: '#c73737',
  brightGreen: '#16864b',
  brightYellow: '#9a4c0b',
  brightBlue: '#0f61d8',
  brightMagenta: '#7259c9',
  brightCyan: '#167485',
  brightWhite: '#1a1a1d',
};

function buildTerminalWebSocketUrl(host: TerminalHost | null) {
  const configuredUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const url = new URL('/terminal/ws', window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    url.port = process.env.NEXT_PUBLIC_TERMINAL_WS_PORT ?? '3001';
  }

  if (host?.cwd) {
    url.searchParams.set('cwd', host.cwd);
  }

  return url.toString();
}

function getTerminalBufferText(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  }

  return lines.join('\n').trimEnd();
}

function parseTerminalMessage(data: MessageEvent['data']) {
  if (typeof data !== 'string') return null;

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
        'inline-block h-1.5 w-1.5 rounded-full',
        status === 'connected' && 'bg-[var(--green)]',
        status === 'connecting' && 'motion-safe:animate-pulse bg-[var(--orange)]',
        status === 'disconnected' && 'bg-[var(--quiet)]',
        status === 'error' && 'bg-[var(--red)]'
      )}
      aria-hidden="true"
    />
  );
}

export function TerminalShell() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [hostRequestKey, setHostRequestKey] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [host, setHost] = useState<TerminalHost | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  const statusLabel: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
    error: 'Connection error',
  };

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const webSocket = webSocketRef.current;

    if (!terminal || !fitAddon) return;

    fitAddon.fit();

    if (webSocket?.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ cols: terminal.cols, rows: terminal.rows, type: 'resize' }));
    }
  }, []);

  const connectTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    webSocketRef.current?.close();
    setConnectionStatus('connecting');
    setConnectionError(null);
    terminal.clear();
    terminal.writeln('\x1b[90mOpening host terminal…\x1b[0m');

    const webSocket = new WebSocket(buildTerminalWebSocketUrl(host));
    webSocketRef.current = webSocket;

    webSocket.addEventListener('open', () => {
      if (webSocketRef.current !== webSocket) return;
      terminal.focus();
      sendResize();
    });

    webSocket.addEventListener('message', (event) => {
      if (webSocketRef.current !== webSocket) return;
      const message = parseTerminalMessage(event.data);
      if (!message) return;

      if (message.type === 'ready') setConnectionStatus('connected');
      if (message.type === 'output') terminal.write(message.data);
      if (message.type === 'error') {
        setConnectionError(message.data);
        terminal.writeln(`\r\n\x1b[31m${message.data}\x1b[0m`);
        setConnectionStatus('error');
      }
      if (message.type === 'exit') {
        terminal.writeln('\r\n\x1b[90mSession closed.\x1b[0m');
        setConnectionStatus('disconnected');
      }
    });

    webSocket.addEventListener('close', () => {
      if (webSocketRef.current === webSocket) {
        setConnectionStatus((c) => (c === 'error' ? c : 'disconnected'));
      }
    });

    webSocket.addEventListener('error', () => {
      if (webSocketRef.current !== webSocket) return;
      setConnectionError('Unable to connect to the terminal server.');
      setConnectionStatus('error');
      terminal.writeln('\r\n\x1b[31mUnable to connect to the terminal server.\x1b[0m');
    });
  }, [host, sendResize]);

  // Load host info
  useEffect(() => {
    let isActive = true;

    async function loadHost() {
      try {
        const response = await fetch('/api/terminal/execute', { cache: 'no-store' });
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as TerminalHostError) : null;

        if (!response.ok) throw new Error(payload?.error ?? 'Unable to open host shell.');
        if (isActive) setHost(payload as TerminalHost);
      } catch (error) {
        if (!isActive) return;
        setConnectionStatus('error');
        setConnectionError(error instanceof Error ? error.message : 'Unable to open host shell.');
        terminalRef.current?.writeln(
          `\x1b[31m${error instanceof Error ? error.message : 'Unable to open host shell.'}\x1b[0m`
        );
      }
    }

    void loadHost();
    return () => {
      isActive = false;
    };
  }, [hostRequestKey]);

  // Initialize xterm
  useEffect(() => {
    if (!terminalElementRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: `${getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono')}, ui-monospace, SFMono-Regular, Menlo, monospace`,
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
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
        ws.send(JSON.stringify({ data, type: 'input' }));
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
    sendResize();
    terminal.focus();
  }, [fontSize, sendResize]);

  async function handleCopySelection() {
    const selection = terminalRef.current?.getSelection();
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
      toast.success('Selection copied');
    } catch {
      toast.error('Unable to copy selection');
    }
  }

  async function handleCopyOutput() {
    const terminal = terminalRef.current;
    const output = terminal ? getTerminalBufferText(terminal) : '';
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      toast.success('Terminal output copied');
    } catch {
      toast.error('Unable to copy terminal output');
    }
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--canvas)]">
      <div className="vercelab-page flex h-full min-h-[420px] flex-col gap-4">
        <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-3 px-0.5">
          <h1 className="vercelab-page-heading">
            Terminal{' '}
            <span className="vercelab-page-count">{host?.hostname ?? 'Connecting to host'}</span>
          </h1>
          <span
            className="flex items-center gap-1.5 text-[10px] text-[var(--muted-ink)]"
            role="status"
          >
            <StatusDot status={connectionStatus} />
            {statusLabel[connectionStatus]}
          </span>
        </header>
        {connectionError || connectionStatus === 'disconnected' ? (
          <WorkspaceNotice tone={connectionError ? 'error' : 'warning'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{connectionError ?? 'The terminal session has closed.'}</span>
              <Button
                onClick={() => {
                  if (host) connectTerminal();
                  else {
                    setConnectionStatus('connecting');
                    setConnectionError(null);
                    setHostRequestKey((key) => key + 1);
                  }
                }}
                size="xs"
                variant="secondary"
              >
                <PlugZap className="size-3.5" aria-hidden="true" />
                Reconnect
              </Button>
            </div>
          </WorkspaceNotice>
        ) : null}
        <section
          aria-label="Host terminal"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow)]"
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <TerminalSquare className="size-4 shrink-0 text-[var(--quiet)]" aria-hidden="true" />
              <span className="truncate font-mono text-[11px] font-medium">
                {host ? `${host.username}@${host.hostname}` : 'Host session'}
              </span>
            </div>
            <div aria-label="Terminal controls" className="flex shrink-0 items-center gap-1">
              <div
                aria-label="Font size"
                className="flex items-center rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-subtle)]"
              >
                <Button
                  aria-label="Decrease font size"
                  title="Decrease font size"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  disabled={fontSize <= FONT_SIZES[0]}
                  onClick={() => setFontSize((size) => Math.max(FONT_SIZES[0], size - 1))}
                >
                  <Minus className="size-3" aria-hidden="true" />
                </Button>
                <span className="w-6 text-center font-mono text-[10px] text-[var(--muted-ink)]">
                  {fontSize}
                </span>
                <Button
                  aria-label="Increase font size"
                  title="Increase font size"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
                  onClick={() =>
                    setFontSize((size) => Math.min(FONT_SIZES[FONT_SIZES.length - 1], size + 1))
                  }
                >
                  <Plus className="size-3" aria-hidden="true" />
                </Button>
              </div>
              <Button
                aria-label="Copy selection"
                title="Copy selection"
                className="size-8"
                size="icon"
                variant="ghost"
                disabled={!hasSelection}
                onClick={handleCopySelection}
              >
                <ClipboardCheck className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                aria-label="Copy all output"
                title="Copy all output"
                className="size-8"
                size="icon"
                variant="ghost"
                onClick={handleCopyOutput}
              >
                <Clipboard className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                aria-label="Clear terminal"
                title="Clear (Ctrl+L)"
                className="size-8"
                size="icon"
                variant="ghost"
                onClick={() => {
                  terminalRef.current?.clear();
                  terminalRef.current?.focus();
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div
            className="min-h-0 flex-1 overflow-hidden bg-[var(--surface-subtle)] p-3"
            ref={terminalElementRef}
          />
          <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--hairline)] px-3 py-2 font-mono text-[9px] text-[var(--quiet)] [overflow-wrap:anywhere]">
            <span>
              OS{' '}
              <span className="text-[var(--muted-ink)]">{host?.osName ?? 'Waiting for host'}</span>
            </span>
            <span>
              Shell <span className="text-[var(--muted-ink)]">{host?.shell ?? '—'}</span>
            </span>
            <span>
              Target{' '}
              <span className="text-[var(--muted-ink)]">
                {host ? (host.target ?? 'host') : '—'}
              </span>
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
