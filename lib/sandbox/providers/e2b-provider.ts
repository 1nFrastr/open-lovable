import { Sandbox } from '@e2b/code-interpreter';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
// SandboxProviderConfig available through parent class
import { appConfig } from '@/config/app.config';

export class E2BProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();

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

      // Create base sandbox
      this.sandbox = await Sandbox.create({ 
        apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
        timeoutMs: this.config.e2b?.timeoutMs || appConfig.e2b.timeoutMs
      });
      
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

    
    const result = await this.sandbox.runCode(`
      import subprocess
      import os

      os.chdir('/home/user/app')
      result = subprocess.run(${JSON.stringify(command.split(' '))}, 
                            capture_output=True, 
                            text=True, 
                            shell=False)

      print("STDOUT:")
      print(result.stdout)
      if result.stderr:
          print("\\nSTDERR:")
          print(result.stderr)
      print(f"\\nReturn code: {result.returncode}")
    `);
    
    const output = result.logs.stdout.join('\n');
    const stderr = result.logs.stderr.join('\n');
    
    return {
      stdout: output,
      stderr,
      exitCode: result.error ? 1 : 0,
      success: !result.error
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    // Use the E2B filesystem API to write the file
    // Note: E2B SDK uses files.write() method
    if ((this.sandbox as any).files && typeof (this.sandbox as any).files.write === 'function') {
      // Use the files.write API if available
      await (this.sandbox as any).files.write(fullPath, Buffer.from(content));
    } else {
      // Fallback to Python code execution
      await this.sandbox.runCode(`
        import os

        # Ensure directory exists
        dir_path = os.path.dirname("${fullPath}")
        os.makedirs(dir_path, exist_ok=True)

        # Write file
        with open("${fullPath}", 'w') as f:
            f.write(${JSON.stringify(content)})
        print(f"✓ Written: ${fullPath}")
      `);
    }
    
    this.existingFiles.add(path);
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    const result = await this.sandbox.runCode(`
      with open("${fullPath}", 'r') as f:
          content = f.read()
      print(content)
    `);
    
    return result.logs.stdout.join('\n');
  }

  async listFiles(directory: string = '/home/user/app'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const result = await this.sandbox.runCode(`
      import os
      import json

      def list_files(path):
          files = []
          for root, dirs, filenames in os.walk(path):
              # Skip node_modules and .git
              dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.next', 'dist', 'build']]
              for filename in filenames:
                  rel_path = os.path.relpath(os.path.join(root, filename), path)
                  files.append(rel_path)
          return files

      files = list_files("${directory}")
      print(json.dumps(files))
    `);
    
    try {
      return JSON.parse(result.logs.stdout.join(''));
    } catch {
      return [];
    }
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const packageList = packages.join(' ');
    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    
    
    const result = await this.sandbox.runCode(`
      import subprocess
      import os

      os.chdir('/home/user/app')

      # Install packages
      result = subprocess.run(
          ['npm', 'install', ${flags ? `'${flags}',` : ''} ${packages.map(p => `'${p}'`).join(', ')}],
          capture_output=True,
          text=True
      )

      print("STDOUT:")
      print(result.stdout)
      if result.stderr:
          print("\\nSTDERR:")
          print(result.stderr)
      print(f"\\nReturn code: {result.returncode}")
    `);
    
    const output = result.logs.stdout.join('\n');
    const stderr = result.logs.stderr.join('\n');
    
    // Restart Vite if configured
    if (appConfig.packages.autoRestartVite && !result.error) {
      await this.restartViteServer();
    }
    
    return {
      stdout: output,
      stderr,
      exitCode: result.error ? 1 : 0,
      success: !result.error
    };
  }

  /**
   * Setup sandbox from template files (bolt.diy style)
   * This is the preferred method - downloads template from GitHub and runs npm install/dev
   */
  async setupFromTemplate(files: Array<{ path: string; content: string }>): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    console.log(`[E2BProvider] Setting up from template with ${files.length} files...`);

    // Write all template files to sandbox
    for (const file of files) {
      await this.writeFile(file.path, file.content);
      this.existingFiles.add(file.path);
    }

    console.log('[E2BProvider] All template files written, running npm install...');

    // Run npm install
    const installResult = await this.sandbox.runCode(`
import subprocess
import os

os.chdir('/home/user/app')

print('Installing dependencies...')
result = subprocess.run(
    ['npm', 'install', '--legacy-peer-deps'],
    capture_output=True,
    text=True,
    timeout=300
)

print("STDOUT:")
print(result.stdout)
if result.stderr:
    print("\\nSTDERR:")
    print(result.stderr)
print(f"\\nReturn code: {result.returncode}")
    `);

    const installOutput = installResult.logs.stdout.join('\n');
    console.log('[E2BProvider] npm install output:', installOutput.slice(0, 500));

    // Start dev server
    console.log('[E2BProvider] Starting dev server...');
    await this.sandbox.runCode(`
import subprocess
import os
import time

os.chdir('/home/user/app')

# Kill any existing dev processes
subprocess.run(['pkill', '-f', 'vite'], capture_output=True)
subprocess.run(['pkill', '-f', 'next'], capture_output=True)
time.sleep(1)

# Start dev server
env = os.environ.copy()
env['FORCE_COLOR'] = '0'
env['CI'] = 'true'

process = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env
)

print(f'✓ Dev server started with PID: {process.pid}')
print('Waiting for server to be ready...')
    `);

    // Wait for dev server to be ready
    await new Promise(resolve => setTimeout(resolve, appConfig.e2b.viteStartupDelay));
    
    console.log('[E2BProvider] Template setup complete');
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

    
    await this.sandbox.runCode(`
import subprocess
import time
import os

os.chdir('/home/user/app')

# Kill existing Vite process
subprocess.run(['pkill', '-f', 'vite'], capture_output=True)
time.sleep(2)

# Start Vite dev server
env = os.environ.copy()
env['FORCE_COLOR'] = '0'

process = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env
)

print(f'✓ Vite restarted with PID: {process.pid}')
    `);
    
    // Wait for Vite to be ready
    await new Promise(resolve => setTimeout(resolve, appConfig.e2b.viteStartupDelay));
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
}