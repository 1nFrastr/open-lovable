import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    
    if (!path) {
      return NextResponse.json({ 
        success: false, 
        error: 'File path is required' 
      }, { status: 400 });
    }
    
    const provider = sandboxManager.getActiveProvider();
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log(`[read-sandbox-file] Reading: ${path}`);
    
    const content = await provider.readFile(path);
    
    return NextResponse.json({
      success: true,
      content
    });
    
  } catch (error) {
    console.error('[read-sandbox-file] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
