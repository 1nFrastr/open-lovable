import { Sandbox } from '@e2b/code-interpreter';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
// SandboxProviderConfig available through parent class
import { appConfig } from '@/config/app.config';

export interface PtySession {
  id: string;
  pid: number;
  createdAt: Date;
}

export interface PtyOutput {
  data: string;
  pid: number;
}

export class E2BProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();
  private ptySession: PtySession | null = null;
  private ptyOutputBuffer: string[] = [];
  private ptyOutputListeners: Set<(data: string) => void> = new Set();
  private usingCustomTemplate: boolean = false;

  /**
   * Check if a custom template is configured
   */
  hasCustomTemplate(): boolean {
    const templateId = this.config.e2b?.template || appConfig.e2b.templateId;
    return !!templateId;
  }

  /**
   * Check if sandbox was created with custom template
   */
  isUsingCustomTemplate(): boolean {
    return this.usingCustomTemplate;
  }

  /**
   * Attempt to reconnect to an existing E2B sandbox
   */
  async reconnect(sandboxId: string): Promise<boolean> {
    try {
      
      // Try to connect to existing sandbox
      // Note: E2B SDK doesn't directly support reconnection, but we can try to recreate
      // For now, return false to indicate reconnection isn't supported
      // In the future, E2B may add this capability
      
      return false;
    } catch (error) {
      console.error(`[E2BProvider] Failed to reconnect to sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  /**
   * Create a sandbox - uses custom template if configured, otherwise creates base sandbox
   */
  async createSandbox(): Promise<SandboxInfo> {
    try {
      
      // Kill existing sandbox if any
      if (this.sandbox) {
        try {
          await this.sandbox.kill();
        } catch (e) {
          console.error('Failed to close existing sandbox:', e);
        }
        this.sandbox = null;
      }
      
      // Clear existing files tracking
      this.existingFiles.clear();
      this.usingCustomTemplate = false;

      // Check if custom template is configured
      const templateId = this.config.e2b?.template || appConfig.e2b.templateId;
      
      if (templateId) {
        // Create sandbox from custom template (dependencies pre-installed)
        // E2B SDK signature: Sandbox.create(template: string, opts?: SandboxOpts)
        console.log(`[E2BProvider] Creating sandbox from custom template: ${templateId}`);
        this.sandbox = await Sandbox.create(templateId, { 
          apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
          timeoutMs: this.config.e2b?.timeoutMs || appConfig.e2b.timeoutMs
        });
        this.usingCustomTemplate = true;
      } else {
        // Create base sandbox (will need npm install later)
        console.log('[E2BProvider] Creating base sandbox (no custom template)');
        this.sandbox = await Sandbox.create({ 
          apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
          timeoutMs: this.config.e2b?.timeoutMs || appConfig.e2b.timeoutMs
        });
      }
      
      const sandboxId = (this.sandbox as any).sandboxId || Date.now().toString();
      const host = (this.sandbox as any).getHost(appConfig.e2b.vitePort);
      

      this.sandboxInfo = {
        sandboxId,
        url: `https://${host}`,
        provider: 'e2b',
        createdAt: new Date()
      };

      // Set extended timeout on the sandbox instance if method available
      if (typeof this.sandbox.setTimeout === 'function') {
        this.sandbox.setTimeout(appConfig.e2b.timeoutMs);
      }

      return this.sandboxInfo;

    } catch (error) {
      console.error('[E2BProvider] Error creating sandbox:', error);
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Use E2B commands.run instead of runCode (works with Node.js templates)
    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: '/home/user/app',
        timeoutMs: 60000, // 1 minute timeout
        envs: {
          FORCE_COLOR: '0',
          CI: 'true'
        }
      });
      
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        success: result.exitCode === 0
      };
    } catch (error) {
      console.error('[E2BProvider] runCommand error:', error);
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        success: false
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    // Ensure directory exists using mkdir -p
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (dirPath) {
      try {
        await this.sandbox.commands.run(`mkdir -p "${dirPath}"`, {
          cwd: '/home/user/app',
          timeoutMs: 5000
        });
      } catch {
        // Directory might already exist
      }
    }
    
    // Use the E2B filesystem API to write the file
    await this.sandbox.files.write(fullPath, content);
    
    this.existingFiles.add(path);
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    // Use E2B files API instead of runCode (works with Node.js templates)
    const content = await this.sandbox.files.read(fullPath);
    return content;
  }

  /**
   * Write multiple files in parallel with batch directory creation
   * This is significantly faster than writing files one by one
   */
  async writeFilesParallel(files: Array<{ path: string; content: string }>): Promise<{ written: string[]; errors: string[] }> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const written: string[] = [];
    const errors: string[] = [];

    if (files.length === 0) {
      return { written, errors };
    }

    console.log(`[E2BProvider] Writing ${files.length} files in parallel...`);
    const startTime = Date.now();

    // 1. Collect all unique directories that need to be created
    const dirs = new Set<string>();
    for (const file of files) {
      const fullPath = file.path.startsWith('/') ? file.path : `/home/user/app/${file.path}`;
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dirPath && dirPath !== '/home/user/app') {
        dirs.add(dirPath);
      }
    }

    // 2. Create all directories in a single command (batch mkdir)
    if (dirs.size > 0) {
      try {
        const dirList = [...dirs].map(d => `"${d}"`).join(' ');
        await this.sandbox.commands.run(`mkdir -p ${dirList}`, {
          cwd: '/home/user/app',
          timeoutMs: 10000
        });
        console.log(`[E2BProvider] Created ${dirs.size} directories in batch`);
      } catch (error) {
        console.warn('[E2BProvider] Batch mkdir warning (directories may already exist):', error);
      }
    }

    // 3. Write all files in parallel using Promise.allSettled
    const writePromises = files.map(async (file) => {
      const fullPath = file.path.startsWith('/') ? file.path : `/home/user/app/${file.path}`;
      try {
        await this.sandbox!.files.write(fullPath, file.content);
        this.existingFiles.add(file.path);
        return { success: true, path: file.path };
      } catch (error) {
        return { success: false, path: file.path, error: (error as Error).message };
      }
    });

    const results = await Promise.allSettled(writePromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          written.push(result.value.path);
        } else {
          errors.push(`${result.value.path}: ${result.value.error}`);
        }
      } else {
        errors.push(`Unknown error: ${result.reason}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[E2BProvider] Parallel write complete: ${written.length} files in ${duration}ms`);
    
    if (errors.length > 0) {
      console.warn(`[E2BProvider] Write errors:`, errors);
    }

    return { written, errors };
  }

  /**
   * Read multiple files in parallel
   * This is significantly faster than reading files one by one
   */
  async readFilesParallel(paths: string[]): Promise<Record<string, string>> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    if (paths.length === 0) {
      return {};
    }

    console.log(`[E2BProvider] Reading ${paths.length} files in parallel...`);
    const startTime = Date.now();

    const results: Record<string, string> = {};
    
    // Read all files in parallel using Promise.allSettled
    const readPromises = paths.map(async (path) => {
      const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
      try {
        const content = await this.sandbox!.files.read(fullPath);
        return { success: true, path, content };
      } catch {
        return { success: false, path, content: null };
      }
    });

    const settled = await Promise.allSettled(readPromises);
    
    let successCount = 0;
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.success && result.value.content !== null) {
        results[result.value.path] = result.value.content;
        successCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[E2BProvider] Parallel read complete: ${successCount}/${paths.length} files in ${duration}ms`);

    return results;
  }

  /**
   * Wait for Vite dev server to be ready using health check polling
   * This replaces fixed delays with actual readiness detection
   */
  async waitForViteReady(maxWait: number = 10000): Promise<boolean> {
    if (!this.sandbox) {
      return false;
    }

    const startTime = Date.now();
    const pollInterval = 300; // Check every 300ms
    let attempts = 0;

    console.log(`[E2BProvider] Waiting for Vite to be ready (max ${maxWait}ms)...`);

    while (Date.now() - startTime < maxWait) {
      attempts++;
      try {
        // Try to curl the Vite dev server
        const result = await this.sandbox.commands.run(
          'curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000"',
          { cwd: '/home/user/app', timeoutMs: 2000 }
        );
        
        const statusCode = result.stdout.trim();
        if (statusCode === '200' || statusCode === '304') {
          const duration = Date.now() - startTime;
          console.log(`[E2BProvider] Vite ready after ${duration}ms (${attempts} attempts)`);
          return true;
        }
      } catch {
        // Ignore errors, keep polling
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`[E2BProvider] Vite not ready after ${maxWait}ms, proceeding anyway`);
    return false;
  }

  async listFiles(directory: string = '/home/user/app'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Use E2B commands.run with find command instead of runCode
    // This works with Node.js templates that don't have Python
    try {
      const result = await this.sandbox.commands.run(
        `find ${directory} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.css" -o -name "*.html" -o -name "*.md" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/.next/*" ! -path "*/dist/*" ! -path "*/build/*" 2>/dev/null | sort`,
        { cwd: directory, timeoutMs: 30000 }
      );
      
      const files = result.stdout
        .split('\n')
        .filter((line: string) => line.trim())
        .map((file: string) => file.replace(`${directory}/`, ''));
      
      return files;
    } catch (error) {
      console.error('[E2BProvider] listFiles error:', error);
      return [];
    }
  }

  /**
   * List files with their sizes in a single command (much faster than individual stat calls)
   * Uses find -printf to get both path and size at once
   */
  async listFilesWithSize(directory: string = '/home/user/app'): Promise<Array<{ path: string; size: number }>> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    try {
      // Use find -printf to get size and path in one command
      // Format: "size path" per line (e.g., "1234 /home/user/app/src/App.tsx")
      const result = await this.sandbox.commands.run(
        `find ${directory} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.css" -o -name "*.html" -o -name "*.md" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/.next/*" ! -path "*/dist/*" ! -path "*/build/*" -printf '%s %p\\n' 2>/dev/null | sort -t' ' -k2`,
        { cwd: directory, timeoutMs: 30000 }
      );
      
      const files = result.stdout
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => {
          const spaceIndex = line.indexOf(' ');
          if (spaceIndex === -1) {
            return { path: line.replace(`${directory}/`, ''), size: 0 };
          }
          const size = parseInt(line.substring(0, spaceIndex), 10) || 0;
          const fullPath = line.substring(spaceIndex + 1);
          return {
            path: fullPath.replace(`${directory}/`, ''),
            size
          };
        });
      
      console.log(`[E2BProvider] listFilesWithSize found ${files.length} files`);
      return files;
    } catch (error) {
      console.error('[E2BProvider] listFilesWithSize error:', error);
      return [];
    }
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    const cmd = `npm install ${flags} ${packages.join(' ')}`;
    
    // Use E2B commands.run instead of runCode
    try {
      const result = await this.sandbox.commands.run(cmd, {
        cwd: '/home/user/app',
        timeoutMs: 300000, // 5 minutes for npm install
        envs: {
          FORCE_COLOR: '0',
          CI: 'true'
        }
      });
      
      // Restart Vite if configured
      if (appConfig.packages.autoRestartVite && result.exitCode === 0) {
        await this.restartViteServer();
      }
      
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        success: result.exitCode === 0
      };
    } catch (error) {
      console.error('[E2BProvider] installPackages error:', error);
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        success: false
      };
    }
  }

  /**
   * Setup sandbox from template files (bolt.diy style)
   * This is the preferred method - downloads template from GitHub and runs npm install/dev
   * 
   * When using a custom E2B template (with pre-installed dependencies):
   * - Skips npm install (dependencies already in the image)
   * - Only starts the dev server
   * - Uses health check polling instead of fixed delay
   */
  async setupFromTemplate(files: Array<{ path: string; content: string }>): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log(`[E2BProvider] Setting up from template with ${files.length} files...`);
    console.log(`[E2BProvider] Using custom template: ${this.usingCustomTemplate}`);

    // Write all template files to sandbox in parallel (optimized)
    const { written, errors } = await this.writeFilesParallel(files);
    console.log(`[E2BProvider] Template files written: ${written.length} success, ${errors.length} errors`);

    // Skip npm install if using custom template (dependencies pre-installed)
    if (!this.usingCustomTemplate) {
      console.log('[E2BProvider] Running npm install (no custom template)...');
      
      try {
        const installResult = await this.sandbox.commands.run('npm install --legacy-peer-deps', {
          cwd: '/home/user/app',
          timeoutMs: 300000, // 5 minutes
          envs: {
            FORCE_COLOR: '0',
            CI: 'true'
          }
        });
        console.log('[E2BProvider] npm install output:', installResult.stdout.slice(0, 500));
      } catch (error) {
        console.error('[E2BProvider] npm install error:', error);
      }
    } else {
      console.log('[E2BProvider] Skipping npm install (using custom template with pre-installed dependencies)');
    }

    // Start dev server
    console.log('[E2BProvider] Starting dev server...');
    
    // Kill any existing dev processes first
    try {
      await this.sandbox.commands.run('pkill -f vite || true', { 
        cwd: '/home/user/app',
        timeoutMs: 5000 
      });
    } catch {
      // Ignore - process might not exist
    }
    
    // Start dev server in background
    await this.sandbox.commands.run('npm run dev', {
      cwd: '/home/user/app',
      background: true,
      envs: {
        FORCE_COLOR: '0',
        CI: 'true'
      }
    });
    
    console.log('[E2BProvider] Dev server started in background');

    // Use health check polling instead of fixed delay
    const maxWait = this.usingCustomTemplate 
      ? appConfig.e2b.viteStartupDelayWithTemplate 
      : appConfig.e2b.viteStartupDelay;
    
    await this.waitForViteReady(maxWait);
    
    console.log('[E2BProvider] Template setup complete');
  }

  /**
   * Quick start for custom template - just start the dev server
   * Use this when sandbox was created from custom template and you don't need to write files
   */
  async startDevServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log('[E2BProvider] Starting dev server (quick start)...');
    
    // Kill any existing dev processes first
    try {
      await this.sandbox.commands.run('pkill -f vite || true', { 
        cwd: '/home/user/app',
        timeoutMs: 5000 
      });
    } catch (e) {
      // Ignore errors - process might not exist
    }
    
    // Start dev server in background using commands.run
    await this.sandbox.commands.run('npm run dev', {
      cwd: '/home/user/app',
      background: true,
      envs: {
        FORCE_COLOR: '0',
        CI: 'true'
      }
    });

    console.log('[E2BProvider] Dev server started in background');

    // Use health check polling instead of fixed delay
    const maxWait = this.usingCustomTemplate 
      ? appConfig.e2b.viteStartupDelayWithTemplate 
      : appConfig.e2b.viteStartupDelay;
    
    await this.waitForViteReady(maxWait);
    console.log('[E2BProvider] Dev server ready');
  }

  /**
   * @deprecated Use setupFromTemplate with bundled templates instead
   * Minimal fallback - creates absolute bare minimum to get React running
   */
  async setupViteApp(): Promise<void> {
    console.warn('[E2BProvider] setupViteApp is deprecated. Use bundled templates instead.');
    
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Absolute minimal fallback - just enough to run React
    const minimalFiles = [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'sandbox-app',
          private: true,
          type: 'module',
          scripts: { dev: 'vite --host', build: 'vite build' },
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
          devDependencies: { '@vitejs/plugin-react': '^4.3.3', vite: '^5.4.10' }
        }, null, 2)
      },
      {
        path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, hmr: false, allowedHosts: ['.e2b.app', '.e2b.dev', 'localhost'] }
})`
      },
      {
        path: 'index.html',
        content: `<!doctype html><html><head><meta charset="UTF-8"/><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`
      },
      {
        path: 'src/main.jsx',
        content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)`
      },
      {
        path: 'src/App.jsx',
        content: `export default function App() { return <div style={{padding:'2rem'}}><h1>Sandbox Ready</h1></div> }`
      }
    ];

    await this.setupFromTemplate(minimalFiles);
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log('[E2BProvider] Restarting Vite server...');
    
    // Kill existing Vite process
    try {
      await this.sandbox.commands.run('pkill -f vite || true', { 
        cwd: '/home/user/app',
        timeoutMs: 5000 
      });
    } catch {
      // Ignore - process might not exist
    }
    
    // Wait a bit for process to fully terminate (reduced from 500ms to 200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Start Vite dev server in background
    await this.sandbox.commands.run('npm run dev', {
      cwd: '/home/user/app',
      background: true,
      envs: {
        FORCE_COLOR: '0',
        CI: 'true'
      }
    });
    
    console.log('[E2BProvider] Vite server restarted');
    
    // Use health check polling instead of fixed delay
    const maxWait = this.usingCustomTemplate 
      ? appConfig.e2b.viteStartupDelayWithTemplate 
      : appConfig.e2b.viteStartupDelay;
    await this.waitForViteReady(maxWait);
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.kill();
      } catch (e) {
        console.error('Failed to terminate sandbox:', e);
      }
      this.sandbox = null;
      this.sandboxInfo = null;
    }
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }

  /**
   * Create a PTY terminal session
   */
  async createPty(cols: number = 80, rows: number = 24): Promise<PtySession> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // Kill existing PTY session if any
    if (this.ptySession) {
      await this.killPty();
    }

    console.log('[E2BProvider] Creating PTY session...');

    // Create a simple PTY session (compatible with Node.js templates)
    // We use commands.run for actual command execution
    this.ptySession = {
      id: `pty-${Date.now()}`,
      pid: Date.now(), // Virtual PID
      createdAt: new Date()
    };

    console.log('[E2BProvider] PTY session created:', this.ptySession);
    return this.ptySession;
  }

  /**
   * Send input to the PTY terminal
   * For Node.js templates, this directly executes the command
   */
  async sendPtyInput(input: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    if (!this.ptySession) {
      throw new Error('No active PTY session');
    }

    // Execute the command using commands.run
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    try {
      const result = await this.sandbox.commands.run(trimmedInput, {
        cwd: '/home/user/app',
        timeoutMs: 60000,
        envs: {
          TERM: 'xterm-256color',
          FORCE_COLOR: '1'
        }
      });

      // Store output in buffer for getPtyOutput
      const output = result.stdout + (result.stderr ? `\n${result.stderr}` : '');
      this.ptyOutputBuffer.push(output);

      // Notify listeners
      for (const listener of this.ptyOutputListeners) {
        listener(output);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Command failed';
      this.ptyOutputBuffer.push(`Error: ${errorMsg}`);
    }
  }


  /**
   * Execute a command in the sandbox and return output
   */
  async executePtyCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log('[E2BProvider] Executing PTY command:', command);

    // Use commands.run instead of runCode (works with Node.js templates)
    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: '/home/user/app',
        timeoutMs: 60000,
        envs: {
          TERM: 'xterm-256color',
          FORCE_COLOR: '1'
        }
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
      console.error('[E2BProvider] PTY command error:', error);
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1
      };
    }
  }

  /**
   * Kill the PTY session
   */
  async killPty(): Promise<void> {
    if (!this.sandbox || !this.ptySession) {
      return;
    }

    console.log('[E2BProvider] Killing PTY session:', this.ptySession.id);

    try {
      await this.sandbox.commands.run(`pkill -P ${this.ptySession.pid} || true; kill -9 ${this.ptySession.pid} || true`, {
        cwd: '/home/user/app',
        timeoutMs: 5000
      });
    } catch (e) {
      console.error('[E2BProvider] Error killing PTY:', e);
    }

    this.ptySession = null;
    this.ptyOutputBuffer = [];
  }

  /**
   * Get current PTY session info
   */
  getPtySession(): PtySession | null {
    return this.ptySession;
  }

  /**
   * Check if PTY session is active
   */
  hasPtySession(): boolean {
    return !!this.ptySession;
  }

  /**
   * Add listener for PTY output
   */
  addPtyOutputListener(listener: (data: string) => void): void {
    this.ptyOutputListeners.add(listener);
  }

  /**
   * Remove listener for PTY output
   */
  removePtyOutputListener(listener: (data: string) => void): void {
    this.ptyOutputListeners.delete(listener);
  }
}