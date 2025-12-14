import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { socketService } from '../../services/socket';
import 'xterm/css/xterm.css';

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface XtermWrapperProps {
  sessionId: string;
  isConnected: boolean;
  isReadOnly: boolean;
}

export default function XtermWrapper({
  sessionId,
  isConnected,
  isReadOnly
}: XtermWrapperProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace',
      theme: {
        background: '#0f0f1a',
        foreground: '#e4e4e7',
        cursor: '#D97706',
        cursorAccent: '#0f0f1a',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa'
      },
      allowTransparency: true,
      scrollback: 10000
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const handleResize = debounce(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        socketService.resizeTerminal(
          xtermRef.current.cols,
          xtermRef.current.rows
        );
      }
    }, 100);

    window.addEventListener('resize', handleResize);

    // Initial resize notification
    setTimeout(() => {
      handleResize();
    }, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  // Handle output
  useEffect(() => {
    if (!xtermRef.current) return;

    const unsubscribe = socketService.onOutput((data) => {
      xtermRef.current?.write(data);
    });

    return unsubscribe;
  }, []);

  // Handle input
  useEffect(() => {
    if (!xtermRef.current || isReadOnly) return;

    const handleData = xtermRef.current.onData((data) => {
      socketService.sendInput(data);
    });

    return () => {
      handleData.dispose();
    };
  }, [isReadOnly, sessionId]);

  // Show connecting message
  useEffect(() => {
    if (!xtermRef.current) return;

    if (!isConnected) {
      xtermRef.current.write('\x1b[2J\x1b[H'); // Clear screen
      xtermRef.current.write('\x1b[33mConnecting to session...\x1b[0m\r\n');
    }
  }, [isConnected]);

  // Show read-only message
  useEffect(() => {
    if (!xtermRef.current || !isConnected) return;

    if (isReadOnly) {
      xtermRef.current.write('\r\n\x1b[33m[Viewer mode - read only]\x1b[0m\r\n');
    }
  }, [isReadOnly, isConnected]);

  // Refocus terminal when clicking
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  return (
    <div
      ref={terminalRef}
      className="h-full w-full"
      onClick={handleClick}
    />
  );
}
