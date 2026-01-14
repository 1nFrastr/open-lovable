import { NextRequest, NextResponse } from 'next/server';
import { SandboxFactory } from '@/lib/sandbox/factory';
import type { SandboxState } from '@/types/sandbox';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { getTemplateByName, DEFAULT_TEMPLATE } from '@/config/templates';
import type { TemplateFile } from '@/types/template';
import { getBundledTemplate, hasBundledTemplate } from '@/lib/templates';

// Store active sandbox globally
declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

interface CreateSandboxRequest {
  template?: string;
}

/**
 * Download template files from GitHub
 * Uses the same approach as bolt.diy - fetches files from GitHub repo
 * Returns null if download fails (e.g., rate limiting)
 */
async function downloadTemplateFiles(githubRepo: string): Promise<TemplateFile[] | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/download-template?repo=${encodeURIComponent(githubRepo)}`);
    
    if (!response.ok) {
      console.warn(`[create-ai-sandbox-v2] Template download failed with status ${response.status}`);
      return null;
    }
    
    const files = await response.json() as TemplateFile[];
    return files;
  } catch (error) {
    console.warn('[create-ai-sandbox-v2] Template download error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body for template parameter
    let templateName = DEFAULT_TEMPLATE;
    try {
      const body = await request.json() as CreateSandboxRequest;
      if (body.template) {
        templateName = body.template;
      }
    } catch {
      // Empty body is OK, use default template
    }

    console.log(`[create-ai-sandbox-v2] Creating sandbox with template: ${templateName}`);
    
    // Clean up all existing sandboxes
    console.log('[create-ai-sandbox-v2] Cleaning up existing sandboxes...');
    await sandboxManager.terminateAll();
    
    // Also clean up legacy global state
    if (global.activeSandboxProvider) {
      try {
        await global.activeSandboxProvider.terminate();
      } catch (e) {
        console.error('Failed to terminate legacy global sandbox:', e);
      }
      global.activeSandboxProvider = null;
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }

    // Create new sandbox using factory
    const provider = SandboxFactory.create();
    const sandboxInfo = await provider.createSandbox();
    
    // Get template configuration
    const template = getTemplateByName(templateName);
    let templateSource: 'bundled' | 'github' | 'fallback' = 'fallback';
    
    // Priority 1: Use pre-bundled template (fastest, no network)
    if (hasBundledTemplate(templateName)) {
      const bundledTemplate = getBundledTemplate(templateName);
      if (bundledTemplate) {
        console.log(`[create-ai-sandbox-v2] Using bundled template: ${templateName}`);
        await provider.setupFromTemplate(bundledTemplate.files);
        templateSource = 'bundled';
      }
    }
    
    // Priority 2: Download from GitHub (if bundled not available)
    if (templateSource === 'fallback' && template && template.githubRepo) {
      console.log(`[create-ai-sandbox-v2] Downloading template from GitHub: ${template.githubRepo}`);
      const templateFiles = await downloadTemplateFiles(template.githubRepo);
      
      if (templateFiles && templateFiles.length > 0) {
        console.log(`[create-ai-sandbox-v2] Downloaded ${templateFiles.length} files, setting up...`);
        await provider.setupFromTemplate(templateFiles);
        templateSource = 'github';
      }
    }
    
    // Priority 3: Fallback to basic setup
    if (templateSource === 'fallback') {
      console.log('[create-ai-sandbox-v2] Using fallback setup...');
      await provider.setupViteApp();
    }
    
    // Register with sandbox manager
    sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
    
    // Also store in legacy global state for backward compatibility
    global.activeSandboxProvider = provider;
    global.sandboxData = {
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url
    };
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId: sandboxInfo.sandboxId
      },
      sandbox: provider, // Store the provider instead of raw sandbox
      sandboxData: {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url
      }
    };
    
    console.log('[create-ai-sandbox-v2] Sandbox ready at:', sandboxInfo.url);
    
    const messages: Record<string, string> = {
      bundled: `Sandbox created with bundled ${template?.label || templateName} template`,
      github: `Sandbox created with ${template?.label || templateName} template from GitHub`,
      fallback: 'Sandbox created with basic setup'
    };
    
    return NextResponse.json({
      success: true,
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
      provider: sandboxInfo.provider,
      template: templateName,
      templateSource,
      message: messages[templateSource]
    });

  } catch (error) {
    console.error('[create-ai-sandbox-v2] Error:', error);
    
    // Clean up on error
    await sandboxManager.terminateAll();
    if (global.activeSandboxProvider) {
      try {
        await global.activeSandboxProvider.terminate();
      } catch (e) {
        console.error('Failed to terminate sandbox on error:', e);
      }
      global.activeSandboxProvider = null;
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}