import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

/**
 * Helper to run a command using either the new provider or legacy sandbox
 */
async function runCommand(provider: any, legacySandbox: any, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // New provider style - accepts string command and returns { stdout, stderr, exitCode, success }
  if (provider && typeof provider.runCommand === 'function') {
    const result = await provider.runCommand(command);
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode ?? 0
    };
  }
  
  // Legacy sandbox style - uses { cmd, args } and stdout/stderr are functions
  if (legacySandbox && typeof legacySandbox.runCommand === 'function') {
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    
    const result = await legacySandbox.runCommand({ cmd, args });
    
    let stdout = '';
    let stderr = '';
    
    if (typeof result.stdout === 'function') {
      stdout = await result.stdout();
    } else {
      stdout = result.stdout || '';
    }
    
    if (typeof result.stderr === 'function') {
      stderr = await result.stderr();
    } else {
      stderr = result.stderr || '';
    }
    
    return {
      stdout,
      stderr,
      exitCode: result.exitCode ?? 0
    };
  }
  
  throw new Error('No valid sandbox to run command');
}

export async function POST() {
  try {
    // Try to get sandbox from multiple sources (prioritize new provider)
    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    const legacySandbox = global.activeSandbox;
    
    if (!provider && !legacySandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[create-zip] Creating project zip...');
    
    // Create zip file in sandbox using standard commands
    // Note: zip command with -x patterns - wildcards are passed directly to zip, not shell-expanded
    const zipResult = await runCommand(
      provider, 
      legacySandbox,
      'zip -r /tmp/project.zip . -x node_modules/* .git/* .next/* dist/* build/* *.log'
    );
    
    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to create zip: ${zipResult.stderr}`);
    }
    
    // Get file size using stat (works in Linux sandbox)
    const sizeResult = await runCommand(
      provider,
      legacySandbox,
      'stat -c %s /tmp/project.zip'
    );
    
    console.log(`[create-zip] Created project.zip (${sizeResult.stdout.trim()} bytes)`);
    
    // Read the zip file and convert to base64
    const readResult = await runCommand(
      provider,
      legacySandbox,
      'base64 /tmp/project.zip'
    );
    
    if (readResult.exitCode !== 0) {
      throw new Error(`Failed to read zip file: ${readResult.stderr}`);
    }
    
    const base64Content = readResult.stdout.trim();
    
    // Create a data URL for download
    const dataUrl = `data:application/zip;base64,${base64Content}`;
    
    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'project.zip',
      message: 'Zip file created successfully'
    });
    
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}