import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import type { SandboxProvider } from '@/lib/sandbox/types';

/**
 * Generate a random filename for the zip download
 * Format: project-YYYYMMDD-HHMMSS-XXXX.zip
 */
function generateZipFilename(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
  const random = Math.random().toString(36).substring(2, 6); // 4 random chars
  return `project-${date}-${time}-${random}.zip`;
}

declare global {
  var activeSandboxProvider: SandboxProvider | null;
}

export async function POST() {
  try {
    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[create-zip] Creating project zip...');
    
    // Create zip file in sandbox using standard commands
    // First remove old zip if exists, then create new one excluding large directories
    await provider.runCommand('rm -f /tmp/project.zip');
    
    // Use find + zip to properly exclude node_modules and other large directories
    const zipResult = await provider.runCommand(
      'cd /home/user/app && find . -type f ' +
      '-not -path "*/node_modules/*" ' +
      '-not -path "*/.git/*" ' +
      '-not -path "*/.next/*" ' +
      '-not -path "*/dist/*" ' +
      '-not -path "*/build/*" ' +
      '-not -path "*/.cache/*" ' +
      '-not -name "*.log" ' +
      '| zip /tmp/project.zip -@'
    );
    
    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to create zip: ${zipResult.stderr}`);
    }
    
    // Get file size using stat (works in Linux sandbox)
    const sizeResult = await provider.runCommand('stat -c %s /tmp/project.zip');
    
    console.log(`[create-zip] Created project.zip (${sizeResult.stdout.trim()} bytes)`);
    
    // Read the zip file and convert to base64
    const readResult = await provider.runCommand('base64 /tmp/project.zip');
    
    if (readResult.exitCode !== 0) {
      throw new Error(`Failed to read zip file: ${readResult.stderr}`);
    }
    
    const base64Content = readResult.stdout.trim();
    
    // Create a data URL for download
    const dataUrl = `data:application/zip;base64,${base64Content}`;
    
    const fileName = generateZipFilename();
    
    return NextResponse.json({
      success: true,
      dataUrl,
      fileName,
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
