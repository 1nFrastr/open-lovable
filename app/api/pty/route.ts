import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { E2BProvider } from '@/lib/sandbox/providers/e2b-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pty - Execute command or manage PTY session
 * 
 * Actions:
 * - execute: Execute a command and return output
 * - create: Create a new PTY session
 * - kill: Kill the current PTY session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, command, cols, rows } = body;

    // Get the active provider
    const provider = sandboxManager.getActiveProvider();
    
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'No active sandbox' },
        { status: 400 }
      );
    }

    // Check if provider is E2B
    if (!(provider instanceof E2BProvider)) {
      return NextResponse.json(
        { success: false, error: 'PTY is only supported with E2B provider' },
        { status: 400 }
      );
    }

    const e2bProvider = provider as E2BProvider;

    switch (action) {
      case 'create': {
        const session = await e2bProvider.createPty(cols || 80, rows || 24);
        return NextResponse.json({
          success: true,
          session
        });
      }

      case 'execute': {
        if (!command) {
          return NextResponse.json(
            { success: false, error: 'Command is required' },
            { status: 400 }
          );
        }

        const result = await e2bProvider.executePtyCommand(command);
        return NextResponse.json({
          success: true,
          ...result
        });
      }

      case 'kill': {
        await e2bProvider.killPty();
        return NextResponse.json({
          success: true,
          message: 'PTY session killed'
        });
      }

      case 'status': {
        const session = e2bProvider.getPtySession();
        return NextResponse.json({
          success: true,
          hasSession: e2bProvider.hasPtySession(),
          session
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[PTY API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pty - Get PTY session status
 */
export async function GET() {
  try {
    const provider = sandboxManager.getActiveProvider();
    
    if (!provider) {
      return NextResponse.json({
        success: true,
        hasSession: false,
        hasSandbox: false
      });
    }

    if (!(provider instanceof E2BProvider)) {
      return NextResponse.json({
        success: true,
        hasSession: false,
        hasSandbox: true,
        providerType: 'vercel'
      });
    }

    const e2bProvider = provider as E2BProvider;
    const session = e2bProvider.getPtySession();

    return NextResponse.json({
      success: true,
      hasSession: e2bProvider.hasPtySession(),
      hasSandbox: true,
      providerType: 'e2b',
      session
    });
  } catch (error: any) {
    console.error('[PTY API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
