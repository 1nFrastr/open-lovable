'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sandboxId?: string;
  onError?: (error: string) => void;
}

export default function Terminal({ sandboxId, onError }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [commandBuffer, setCommandBuffer] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#f0f0f0',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#3a3a3a',
        black: '#1a1a1a',
        red: '#ff6b6b',
        green: '#69db7c',
        yellow: '#ffd43b',
        blue: '#74c0fc',
        magenta: '#da77f2',
        cyan: '#63e6be',
        white: '#e0e0e0',
        brightBlack: '#4a4a4a',
        brightRed: '#ff8787',
        brightGreen: '#8ce99a',
        brightYellow: '#ffe066',
        brightBlue: '#a5d8ff',
        brightMagenta: '#e599f7',
        brightCyan: '#96f2d7',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Welcome message
    xterm.writeln('\x1b[1;36m╭─────────────────────────────────────╮\x1b[0m');
    xterm.writeln('\x1b[1;36m│\x1b[0m   \x1b[1;33mE2B Sandbox Terminal\x1b[0m              \x1b[1;36m│\x1b[0m');
    xterm.writeln('\x1b[1;36m│\x1b[0m   Type commands to interact         \x1b[1;36m│\x1b[0m');
    xterm.writeln('\x1b[1;36m╰─────────────────────────────────────╯\x1b[0m');
    xterm.writeln('');

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Fit terminal on container resize
  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Check sandbox connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/pty');
        const data = await response.json();
        setIsConnected(data.hasSandbox);
        
        if (data.hasSandbox && xtermRef.current) {
          xtermRef.current.writeln('\x1b[1;32m✓ Connected to sandbox\x1b[0m');
          xtermRef.current.writeln(`\x1b[90mProvider: ${data.providerType || 'unknown'}\x1b[0m`);
          xtermRef.current.writeln('');
          // Show prompt inline to avoid dependency cycle
          xtermRef.current.write('\x1b[1;34m~/app\x1b[0m \x1b[1;32m$\x1b[0m ');
        }
      } catch (error) {
        console.error('Failed to check PTY status:', error);
      }
    };

    checkConnection();
  }, [sandboxId]);

  const showPrompt = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.write('\x1b[1;34m~/app\x1b[0m \x1b[1;32m$\x1b[0m ');
    }
  }, []);

  const executeCommand = useCallback(async (command: string) => {
    const xterm = xtermRef.current;
    if (!xterm || !command.trim()) {
      showPrompt();
      return;
    }

    setIsLoading(true);

    // Add to history
    if (command.trim()) {
      setCommandHistory(prev => [...prev.filter(c => c !== command), command]);
      setHistoryIndex(-1);
    }

    // Handle built-in commands
    const trimmedCommand = command.trim();
    
    if (trimmedCommand === 'clear' || trimmedCommand === 'cls') {
      xterm.clear();
      showPrompt();
      setIsLoading(false);
      return;
    }

    if (trimmedCommand === 'help') {
      xterm.writeln('');
      xterm.writeln('\x1b[1;33mAvailable Commands:\x1b[0m');
      xterm.writeln('  \x1b[36mls\x1b[0m                 - List files');
      xterm.writeln('  \x1b[36mcat <file>\x1b[0m         - View file contents');
      xterm.writeln('  \x1b[36mnpm install\x1b[0m        - Install dependencies');
      xterm.writeln('  \x1b[36mnpm run dev\x1b[0m        - Start dev server');
      xterm.writeln('  \x1b[36mpwd\x1b[0m                - Print working directory');
      xterm.writeln('  \x1b[36mclear\x1b[0m              - Clear terminal');
      xterm.writeln('  \x1b[36mhelp\x1b[0m               - Show this help');
      xterm.writeln('');
      showPrompt();
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/pty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          command: trimmedCommand
        })
      });

      const data = await response.json();

      if (!data.success) {
        xterm.writeln(`\x1b[31mError: ${data.error}\x1b[0m`);
      } else {
        // Write stdout
        if (data.stdout) {
          const lines = data.stdout.split('\n');
          lines.forEach((line: string) => {
            if (line) xterm.writeln(line);
          });
        }

        // Write stderr in red
        if (data.stderr) {
          const lines = data.stderr.split('\n');
          lines.forEach((line: string) => {
            if (line) xterm.writeln(`\x1b[31m${line}\x1b[0m`);
          });
        }

        // Show exit code if non-zero
        if (data.exitCode !== 0) {
          xterm.writeln(`\x1b[90mExit code: ${data.exitCode}\x1b[0m`);
        }
      }
    } catch (error: any) {
      xterm.writeln(`\x1b[31mFailed to execute command: ${error.message}\x1b[0m`);
      onError?.(error.message);
    }

    xterm.writeln('');
    showPrompt();
    setIsLoading(false);
  }, [showPrompt, onError]);

  // Handle keyboard input
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    let currentBuffer = '';

    const handleData = (data: string) => {
      if (isLoading) return;

      const code = data.charCodeAt(0);

      // Enter
      if (code === 13) {
        xterm.writeln('');
        executeCommand(currentBuffer);
        currentBuffer = '';
        setCommandBuffer('');
        return;
      }

      // Backspace
      if (code === 127 || code === 8) {
        if (currentBuffer.length > 0) {
          currentBuffer = currentBuffer.slice(0, -1);
          setCommandBuffer(currentBuffer);
          xterm.write('\b \b');
        }
        return;
      }

      // Ctrl+C
      if (code === 3) {
        xterm.writeln('^C');
        currentBuffer = '';
        setCommandBuffer('');
        showPrompt();
        return;
      }

      // Ctrl+L (clear)
      if (code === 12) {
        xterm.clear();
        showPrompt();
        xterm.write(currentBuffer);
        return;
      }

      // Arrow Up (history)
      if (data === '\x1b[A') {
        if (commandHistory.length > 0) {
          const newIndex = historyIndex === -1 
            ? commandHistory.length - 1 
            : Math.max(0, historyIndex - 1);
          
          // Clear current line
          xterm.write('\r\x1b[K');
          showPrompt();
          
          const historyCommand = commandHistory[newIndex];
          currentBuffer = historyCommand;
          setCommandBuffer(historyCommand);
          setHistoryIndex(newIndex);
          xterm.write(historyCommand);
        }
        return;
      }

      // Arrow Down (history)
      if (data === '\x1b[B') {
        if (historyIndex >= 0) {
          const newIndex = historyIndex + 1;
          
          // Clear current line
          xterm.write('\r\x1b[K');
          showPrompt();
          
          if (newIndex >= commandHistory.length) {
            currentBuffer = '';
            setCommandBuffer('');
            setHistoryIndex(-1);
          } else {
            const historyCommand = commandHistory[newIndex];
            currentBuffer = historyCommand;
            setCommandBuffer(historyCommand);
            setHistoryIndex(newIndex);
            xterm.write(historyCommand);
          }
        }
        return;
      }

      // Regular character
      if (code >= 32 && code < 127) {
        currentBuffer += data;
        setCommandBuffer(currentBuffer);
        xterm.write(data);
      }
    };

    const disposable = xterm.onData(handleData);

    return () => {
      disposable.dispose();
    };
  }, [executeCommand, showPrompt, isLoading, commandHistory, historyIndex]);

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a]">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252525] border-b border-[#333]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>
          <span className="text-sm text-gray-400 ml-2">Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-500">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              Running...
            </div>
          )}
          {isConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-green-500">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              Connected
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
              No sandbox
            </div>
          )}
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={terminalRef} 
        className="flex-1 p-2"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
