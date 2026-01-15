import { NextResponse } from 'next/server';
import { SandboxProvider } from '@/lib/sandbox/types';

declare global {
  var activeSandboxProvider: SandboxProvider | null;
}

export async function GET() {
  try {
    const provider = global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[sandbox-logs] Fetching Vite dev server logs...');
    
    // Check if Vite processes are running
    const psResult = await provider.runCommand('ps aux');
    
    let viteRunning = false;
    const logContent: string[] = [];
    
    if (psResult.exitCode === 0) {
      const psOutput = psResult.stdout;
      const viteProcesses = psOutput.split('\n').filter((line: string) => 
        line.toLowerCase().includes('vite') || 
        line.toLowerCase().includes('npm run dev')
      );
      
      viteRunning = viteProcesses.length > 0;
      
      if (viteRunning) {
        logContent.push("Vite is running");
        logContent.push(...viteProcesses.slice(0, 3)); // Show first 3 processes
      } else {
        logContent.push("Vite process not found");
      }
    }
    
    // Try to read any recent log files
    try {
      const findResult = await provider.runCommand('find /tmp -name "*vite*" -name "*.log" -type f 2>/dev/null');
      
      if (findResult.exitCode === 0 && findResult.stdout.trim()) {
        const logFiles = findResult.stdout.split('\n').filter((f: string) => f.trim());
        
        for (const logFile of logFiles.slice(0, 2)) {
          try {
            const tailResult = await provider.runCommand(`tail -n 10 "${logFile}"`);
            
            if (tailResult.exitCode === 0) {
              logContent.push(`--- ${logFile} ---`);
              logContent.push(tailResult.stdout);
            }
          } catch {
            // Skip if can't read log file
          }
        }
      }
    } catch {
      // No log files found, that's OK
    }
    
    return NextResponse.json({
      success: true,
      hasErrors: false,
      logs: logContent,
      status: viteRunning ? 'running' : 'stopped'
    });
    
  } catch (error) {
    console.error('[sandbox-logs] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
