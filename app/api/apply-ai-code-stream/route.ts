import { NextRequest, NextResponse } from 'next/server';
import { parseMorphEdits, applyMorphEditToFile } from '@/lib/morph-fast-apply';
import type { SandboxState } from '@/types/sandbox';
import type { SandboxProvider } from '@/lib/sandbox/types';
import type { ConversationState } from '@/types/conversation';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

// ============================================================================
// Type Declarations
// ============================================================================

declare global {
  var conversationState: ConversationState | null;
  var activeSandboxProvider: SandboxProvider | null;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
  var sandboxData: any;
}

interface ParsedResponse {
  explanation: string;
  template: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  commands: string[];
  structure: string | null;
}

/** Results of code application */
interface ApplyResults {
  filesCreated: string[];
  filesUpdated: string[];
  packagesInstalled: string[];
  packagesAlreadyInstalled: string[];
  packagesFailed: string[];
  commandsExecuted: string[];
  errors: string[];
}

/** Progress event types for SSE streaming */
type ProgressEvent =
  | { type: 'start'; message: string; totalSteps: number }
  | { type: 'step'; step: number; message: string; packages?: string[] }
  | { type: 'info'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'package-progress'; [key: string]: unknown }
  | { type: 'file-progress'; current: number; total: number; fileName: string; action: string }
  | { type: 'file-complete'; fileName: string; action: string }
  | { type: 'file-error'; fileName: string; error: string }
  | { type: 'command-progress'; current: number; total: number; command: string; action: string }
  | { type: 'command-output'; command: string; output: string; stream: 'stdout' | 'stderr' }
  | { type: 'command-complete'; command: string; exitCode: number; success: boolean }
  | { type: 'command-error'; command: string; error: string }
  | { type: 'complete'; results: ApplyResults; explanation: string; structure: string | null; message: string }
  | { type: 'error'; error: string };

/** File data prepared for writing */
interface FileToWrite {
  path: string;
  content: string;
  originalPath: string;
}

/** Context passed to step functions */
interface StepContext {
  provider: SandboxProvider;
  sendProgress: (data: ProgressEvent) => Promise<void>;
  results: ApplyResults;
  request: NextRequest;
}

// ============================================================================
// Constants
// ============================================================================

/** Config files that should not be overwritten by AI-generated code */
const PROTECTED_CONFIG_FILES = [
  'tailwind.config.js',
  'vite.config.js',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'postcss.config.js'
] as const;

/** Pre-installed packages that don't need to be installed */
const PREINSTALLED_PACKAGES = ['react', 'react-dom'] as const;

/** Default host for development */
const DEFAULT_DEV_HOST = 'localhost:3000';

/** Delay for Vite HMR to detect file changes (ms) */
const VITE_HMR_DELAY_MS = 500;

/** JavaScript/TypeScript file extensions */
const JS_EXTENSIONS = ['.jsx', '.js', '.tsx', '.ts'] as const;

/** Invalid Tailwind shadow classes and their replacements */
const INVALID_TAILWIND_CLASSES: Record<string, string> = {
  'shadow-3xl': 'shadow-2xl',
  'shadow-4xl': 'shadow-2xl',
  'shadow-5xl': 'shadow-2xl'
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a file path to the expected sandbox structure
 * - Removes leading slashes
 * - Adds 'src/' prefix for non-standard paths
 */
function normalizePath(path: string): string {
  let normalized = path.startsWith('/') ? path.slice(1) : path;
  const fileName = normalized.split('/').pop() || '';

  if (
    !normalized.startsWith('src/') &&
    !normalized.startsWith('public/') &&
    normalized !== 'index.html' &&
    !PROTECTED_CONFIG_FILES.includes(fileName as typeof PROTECTED_CONFIG_FILES[number])
  ) {
    normalized = 'src/' + normalized;
  }

  return normalized;
}

/**
 * Check if a file has a JavaScript/TypeScript extension
 */
function isJsFile(path: string): boolean {
  return JS_EXTENSIONS.some(ext => path.endsWith(ext));
}

/**
 * Process file content before writing
 * - Remove CSS imports from JS files (using Tailwind)
 * - Fix invalid Tailwind shadow classes
 */
function processFileContent(path: string, content: string): string {
  let processed = content;

  // Remove CSS imports from JS/TS files (we're using Tailwind)
  if (isJsFile(path)) {
    processed = processed.replace(/import\s+['"]\.\/[^'"]+\.css['"];?\s*\n?/g, '');
  }

  // Fix invalid Tailwind shadow classes in CSS files
  if (path.endsWith('.css')) {
    for (const [invalid, valid] of Object.entries(INVALID_TAILWIND_CLASSES)) {
      processed = processed.replace(new RegExp(invalid, 'g'), valid);
    }
  }

  return processed;
}

/**
 * Create initial results object
 */
function createInitialResults(): ApplyResults {
  return {
    filesCreated: [],
    filesUpdated: [],
    packagesInstalled: [],
    packagesAlreadyInstalled: [],
    packagesFailed: [],
    commandsExecuted: [],
    errors: []
  };
}

/**
 * Deduplicate and filter packages
 */
function preparePackages(inputPackages: string[], parsedPackages: string[]): string[] {
  const packagesArray = Array.isArray(inputPackages) ? inputPackages : [];
  const parsedArray = Array.isArray(parsedPackages) ? parsedPackages : [];

  // Combine and filter
  const allPackages = [
    ...packagesArray.filter(pkg => pkg && typeof pkg === 'string'),
    ...parsedArray
  ];

  // Deduplicate and filter out pre-installed
  const uniquePackages = [...new Set(allPackages)]
    .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '')
    .filter(pkg => !PREINSTALLED_PACKAGES.includes(pkg as typeof PREINSTALLED_PACKAGES[number]));

  // Log if duplicates were removed
  if (allPackages.length !== uniquePackages.length) {
    console.log(`[apply-ai-code-stream] Removed ${allPackages.length - uniquePackages.length} duplicate packages`);
    console.log(`[apply-ai-code-stream] Original packages:`, allPackages);
    console.log(`[apply-ai-code-stream] Deduplicated packages:`, uniquePackages);
  }

  return uniquePackages;
}

// ============================================================================
// Step Functions
// ============================================================================

/**
 * Step 1: Install packages via streaming API
 */
async function installPackagesStep(
  ctx: StepContext,
  packages: string[],
  sandboxId?: string
): Promise<void> {
  if (packages.length === 0) {
    await ctx.sendProgress({
      type: 'step',
      step: 1,
      message: 'No additional packages to install, skipping...'
    });
    return;
  }

  await ctx.sendProgress({
    type: 'step',
    step: 1,
    message: `Installing ${packages.length} packages...`,
    packages
  });

  try {
    // Construct API URL for both dev and production
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = ctx.request.headers.get('host') || DEFAULT_DEV_HOST;
    const apiUrl = `${protocol}://${host}/api/install-packages`;

    const installResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packages,
        sandboxId: sandboxId || ctx.provider.getSandboxInfo()?.sandboxId
      })
    });

    if (installResponse.ok && installResponse.body) {
      const reader = installResponse.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          if (!chunk) continue;

          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                await ctx.sendProgress({ type: 'package-progress', ...data });

                if (data.type === 'success' && data.installedPackages) {
                  ctx.results.packagesInstalled = data.installedPackages;
                }
              } catch {
                // Ignore JSON parse errors for terminal output
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[apply-ai-code-stream] Error installing packages:', error);
    await ctx.sendProgress({
      type: 'warning',
      message: `Package installation skipped (${errorMessage}). Continuing with file creation...`
    });
    ctx.results.errors.push(`Package installation failed: ${errorMessage}`);
  }
}

/**
 * Apply Morph fast edits to files
 */
async function applyMorphEditsStep(
  ctx: StepContext,
  morphEdits: Array<{ targetFile: string; instructions: string; update: string }>
): Promise<Set<string>> {
  const morphUpdatedPaths = new Set<string>();

  if (morphEdits.length === 0) {
    return morphUpdatedPaths;
  }

  if (!ctx.provider) {
    console.warn('[apply-ai-code-stream] No sandbox available to apply Morph edits');
    await ctx.sendProgress({ type: 'warning', message: 'No sandbox available to apply Morph edits' });
    return morphUpdatedPaths;
  }

  await ctx.sendProgress({ type: 'info', message: `Applying ${morphEdits.length} fast edits via Morph...` });

  for (const [idx, edit] of morphEdits.entries()) {
    try {
      await ctx.sendProgress({
        type: 'file-progress',
        current: idx + 1,
        total: morphEdits.length,
        fileName: edit.targetFile,
        action: 'morph-applying'
      });

      const result = await applyMorphEditToFile({
        sandbox: ctx.provider,
        targetPath: edit.targetFile,
        instructions: edit.instructions,
        updateSnippet: edit.update
      });

      if (result.success && result.normalizedPath) {
        console.log('[apply-ai-code-stream] Morph updated', result.normalizedPath);
        morphUpdatedPaths.add(result.normalizedPath);
        ctx.results.filesUpdated.push(result.normalizedPath);
        await ctx.sendProgress({
          type: 'file-complete',
          fileName: result.normalizedPath,
          action: 'morph-updated'
        });
      } else {
        const msg = result.error || 'Unknown Morph error';
        console.error('[apply-ai-code-stream] Morph apply failed for', edit.targetFile, msg);
        ctx.results.errors.push(`Morph apply failed for ${edit.targetFile}: ${msg}`);
        await ctx.sendProgress({ type: 'file-error', fileName: edit.targetFile, error: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[apply-ai-code-stream] Morph apply exception for', edit.targetFile, msg);
      ctx.results.errors.push(`Morph apply exception for ${edit.targetFile}: ${msg}`);
      await ctx.sendProgress({ type: 'file-error', fileName: edit.targetFile, error: msg });
    }
  }

  return morphUpdatedPaths;
}

/**
 * Prepare files for writing by normalizing paths and processing content
 */
function prepareFilesForWriting(
  files: Array<{ path: string; content: string }>,
  morphUpdatedPaths: Set<string>
): FileToWrite[] {
  // Filter out protected config files and invalid entries
  let filteredFiles = files.filter(file => {
    if (!file || typeof file !== 'object') return false;
    const fileName = (file.path || '').split('/').pop() || '';
    return !PROTECTED_CONFIG_FILES.includes(fileName as typeof PROTECTED_CONFIG_FILES[number]);
  });

  // Filter out Morph-updated files
  if (morphUpdatedPaths.size > 0) {
    filteredFiles = filteredFiles.filter(file => {
      if (!file?.path) return true;
      const normalized = normalizePath(file.path);
      return !morphUpdatedPaths.has(normalized);
    });
  }

  // Prepare files with normalized paths and processed content
  return filteredFiles.map(file => ({
    path: normalizePath(file.path),
    content: processFileContent(file.path, file.content),
    originalPath: file.path
  }));
}

/**
 * Write files in parallel using provider's parallel write method
 */
async function writeFilesParallel(
  ctx: StepContext,
  filesToWrite: FileToWrite[]
): Promise<void> {
  await ctx.sendProgress({
    type: 'file-progress',
    current: 0,
    total: filesToWrite.length,
    fileName: 'Writing files in parallel...',
    action: 'creating'
  });

  const providerWithParallel = ctx.provider as SandboxProvider & {
    writeFilesParallel: (files: Array<{ path: string; content: string }>) => Promise<{ written: string[]; errors: string[] }>;
  };

  const { written, errors: writeErrors } = await providerWithParallel.writeFilesParallel(
    filesToWrite.map(f => ({ path: f.path, content: f.content }))
  );

  // Update results and cache
  for (const path of written) {
    const fileData = filesToWrite.find(f => f.path === path);
    const isUpdate = global.existingFiles.has(path);

    // Update file cache
    if (global.sandboxState?.fileCache && fileData) {
      global.sandboxState.fileCache.files[path] = {
        content: fileData.content,
        lastModified: Date.now()
      };
    }

    if (isUpdate) {
      ctx.results.filesUpdated.push(path);
    } else {
      ctx.results.filesCreated.push(path);
      global.existingFiles?.add(path);
    }
  }

  // Record errors
  for (const err of writeErrors) {
    ctx.results.errors.push(err);
  }

  // Wait for Vite HMR to detect changes
  await new Promise(resolve => setTimeout(resolve, VITE_HMR_DELAY_MS));

  await ctx.sendProgress({
    type: 'file-complete',
    fileName: `${written.length} files`,
    action: 'created'
  });
}

/**
 * Write files sequentially (fallback when parallel not available)
 */
async function writeFilesSequential(
  ctx: StepContext,
  filesToWrite: FileToWrite[]
): Promise<void> {
  for (const [index, fileData] of filesToWrite.entries()) {
    try {
      await ctx.sendProgress({
        type: 'file-progress',
        current: index + 1,
        total: filesToWrite.length,
        fileName: fileData.path,
        action: 'creating'
      });

      const isUpdate = global.existingFiles.has(fileData.path);

      // Create directory if needed
      const dirPath = fileData.path.includes('/')
        ? fileData.path.substring(0, fileData.path.lastIndexOf('/'))
        : '';
      if (dirPath) {
        await ctx.provider.runCommand(`mkdir -p ${dirPath}`);
      }

      // Write the file
      await ctx.provider.writeFile(fileData.path, fileData.content);

      // Update file cache
      if (global.sandboxState?.fileCache) {
        global.sandboxState.fileCache.files[fileData.path] = {
          content: fileData.content,
          lastModified: Date.now()
        };
      }

      if (isUpdate) {
        ctx.results.filesUpdated.push(fileData.path);
      } else {
        ctx.results.filesCreated.push(fileData.path);
        global.existingFiles?.add(fileData.path);
      }

      await ctx.sendProgress({
        type: 'file-complete',
        fileName: fileData.path,
        action: isUpdate ? 'updated' : 'created'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      ctx.results.errors.push(`Failed to create ${fileData.originalPath}: ${errorMessage}`);
      await ctx.sendProgress({
        type: 'file-error',
        fileName: fileData.originalPath,
        error: errorMessage
      });
    }
  }
}

/**
 * Step 2: Apply files to sandbox
 */
async function applyFilesStep(
  ctx: StepContext,
  files: Array<{ path: string; content: string }>,
  morphEnabled: boolean,
  morphEdits: Array<{ targetFile: string; instructions: string; update: string }>
): Promise<void> {
  const filesArray = Array.isArray(files) ? files : [];
  await ctx.sendProgress({
    type: 'step',
    step: 2,
    message: `Creating ${filesArray.length} files...`
  });

  // Apply Morph edits first if enabled
  let morphUpdatedPaths = new Set<string>();
  if (morphEnabled && morphEdits.length > 0) {
    morphUpdatedPaths = await applyMorphEditsStep(ctx, morphEdits);
  }

  // Prepare files for writing
  const filesToWrite = prepareFilesForWriting(filesArray, morphUpdatedPaths);

  if (filesToWrite.length === 0) {
    return;
  }

  // Check if parallel write is available
  const hasParallelWrite = typeof (ctx.provider as unknown as Record<string, unknown>).writeFilesParallel === 'function';

  if (hasParallelWrite) {
    await writeFilesParallel(ctx, filesToWrite);
  } else {
    await writeFilesSequential(ctx, filesToWrite);
  }
}

/**
 * Step 3: Execute commands in sandbox
 */
async function executeCommandsStep(
  ctx: StepContext,
  commands: string[]
): Promise<void> {
  const commandsArray = Array.isArray(commands) ? commands : [];

  if (commandsArray.length === 0) {
    return;
  }

  await ctx.sendProgress({
    type: 'step',
    step: 3,
    message: `Executing ${commandsArray.length} commands...`
  });

  for (const [index, cmd] of commandsArray.entries()) {
    try {
      await ctx.sendProgress({
        type: 'command-progress',
        current: index + 1,
        total: commandsArray.length,
        command: cmd,
        action: 'executing'
      });

      const result = await ctx.provider.runCommand(cmd);

      if (result.stdout) {
        await ctx.sendProgress({
          type: 'command-output',
          command: cmd,
          output: result.stdout,
          stream: 'stdout'
        });
      }

      if (result.stderr) {
        await ctx.sendProgress({
          type: 'command-output',
          command: cmd,
          output: result.stderr,
          stream: 'stderr'
        });
      }

      ctx.results.commandsExecuted.push(cmd);

      await ctx.sendProgress({
        type: 'command-complete',
        command: cmd,
        exitCode: result.exitCode,
        success: result.exitCode === 0
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      ctx.results.errors.push(`Failed to execute ${cmd}: ${errorMessage}`);
      await ctx.sendProgress({
        type: 'command-error',
        command: cmd,
        error: errorMessage
      });
    }
  }
}

/**
 * Update conversation state after successful application
 */
function updateConversationState(results: ApplyResults, explanation: string): void {
  if (!global.conversationState || results.filesCreated.length === 0) {
    return;
  }

  const messages = global.conversationState.context.messages;
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      lastMessage.metadata = {
        ...lastMessage.metadata,
        editedFiles: results.filesCreated
      };
    }
  }

  // Track in project evolution
  if (global.conversationState.context.projectEvolution) {
    global.conversationState.context.projectEvolution.majorChanges.push({
      timestamp: Date.now(),
      description: explanation || 'Code applied',
      filesAffected: results.filesCreated
    });
  }

  global.conversationState.lastUpdated = Date.now();
}

/**
 * Main processing function - orchestrates all steps
 */
async function processCodeApplication(
  provider: SandboxProvider,
  request: NextRequest,
  parsed: ParsedResponse,
  inputPackages: string[],
  morphEnabled: boolean,
  morphEdits: Array<{ targetFile: string; instructions: string; update: string }>,
  sandboxId: string | undefined,
  sendProgress: (data: ProgressEvent) => Promise<void>,
  closeWriter: () => Promise<void>
): Promise<void> {
  const results = createInitialResults();

  const ctx: StepContext = {
    provider,
    sendProgress,
    results,
    request
  };

  try {
    await sendProgress({
      type: 'start',
      message: 'Starting code application...',
      totalSteps: 3
    });

    // Log Morph status
    if (morphEnabled) {
      await sendProgress({ type: 'info', message: 'Morph Fast Apply enabled' });
      await sendProgress({ type: 'info', message: `Parsed ${morphEdits.length} Morph edits` });
      if (morphEdits.length === 0) {
        console.warn('[apply-ai-code-stream] Morph enabled but no <edit> blocks found; falling back to full-file flow');
        await sendProgress({ type: 'warning', message: 'Morph enabled but no <edit> blocks found; falling back to full-file flow' });
      }
    }

    // Step 1: Install packages
    const uniquePackages = preparePackages(inputPackages, parsed.packages);
    await installPackagesStep(ctx, uniquePackages, sandboxId);

    // Step 2: Apply files
    await applyFilesStep(ctx, parsed.files, morphEnabled, morphEdits);

    // Step 3: Execute commands
    await executeCommandsStep(ctx, parsed.commands);

    // Send completion
    await sendProgress({
      type: 'complete',
      results,
      explanation: parsed.explanation,
      structure: parsed.structure,
      message: `Successfully applied ${results.filesCreated.length} files`
    });

    // Update conversation state
    updateConversationState(results, parsed.explanation);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    try {
      await sendProgress({ type: 'error', error: errorMessage });
    } catch {
      // Ignore errors when sending error progress
    }
  } finally {
    try {
      await closeWriter();
    } catch {
      // Ignore errors when closing writer
    }
  }
}

// ============================================================================
// AI Response Parser
// ============================================================================

function parseAIResponse(response: string): ParsedResponse {
  const sections: ParsedResponse = {
    files: [],
    commands: [],
    packages: [],
    structure: null,
    explanation: '',
    template: ''
  };

  // Function to extract packages from import statements
  function extractPackagesFromCode(content: string): string[] {
    const packages: string[] = [];
    // Match ES6 imports: import { X } from 'pkg' | import * as X from 'pkg' | import X from 'pkg'
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    let importMatch;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const importPath = importMatch[1];
      // Skip relative imports, built-in React, and alias imports
      if (
        !importPath.startsWith('.') &&
        !importPath.startsWith('/') &&
        importPath !== 'react' &&
        importPath !== 'react-dom' &&
        !importPath.startsWith('@/')
      ) {
        // Extract package name (handle scoped packages like @heroicons/react)
        const packageName = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0];

        if (!packages.includes(packageName)) {
          packages.push(packageName);
          if (packageName === 'react-router-dom' || packageName.includes('router') || packageName.includes('icon')) {
            console.log(`[apply-ai-code-stream] Detected package from imports: ${packageName}`);
          }
        }
      }
    }

    return packages;
  }

  // Parse file sections - handle duplicates and prefer complete versions
  const fileMap = new Map<string, { content: string; isComplete: boolean }>();

  // Match <file path="...">content</file> or unclosed <file path="...">content
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match;

  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    const hasClosingTag = response.substring(match.index, match.index + match[0].length).includes('</file>');
    const existing = fileMap.get(filePath);

    let shouldReplace = false;
    if (!existing) {
      shouldReplace = true;
    } else if (!existing.isComplete && hasClosingTag) {
      shouldReplace = true;
      console.log(`[apply-ai-code-stream] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true;
      console.log(`[apply-ai-code-stream] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true;
    }

    if (shouldReplace) {
      // Warn about potentially truncated content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`[apply-ai-code-stream] Warning: ${filePath} contains ellipsis, may be truncated`);
        if (!existing) {
          fileMap.set(filePath, { content, isComplete: hasClosingTag });
        }
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag });
      }
    }
  }

  // Convert map to array
  for (const [path, { content, isComplete }] of fileMap.entries()) {
    if (!isComplete) {
      console.log(`[apply-ai-code-stream] Warning: File ${path} appears to be truncated (no closing tag)`);
    }

    sections.files.push({ path, content });

    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
      }
    }
  }

  // Parse markdown code blocks with file paths
  const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g;
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();

    // Check for duplicates
    if (!sections.files.some(f => f.path === filePath)) {
      sections.files.push({ path: filePath, content });

      const filePackages = extractPackagesFromCode(content);
      for (const pkg of filePackages) {
        if (!sections.packages.includes(pkg)) {
          sections.packages.push(pkg);
          console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
        }
      }
    }
  }

  // Parse plain text format like "Generated Files: Header.jsx, index.css"
  const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i);
  if (generatedFilesMatch) {
    const filesList = generatedFilesMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f =>
        f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.tsx') ||
        f.endsWith('.ts') || f.endsWith('.css') || f.endsWith('.json') || f.endsWith('.html')
      );
    console.log(`[apply-ai-code-stream] Detected generated files from plain text: ${filesList.join(', ')}`);

    for (const fileName of filesList) {
      const fileContentRegex = new RegExp(`${fileName}[\\s\\S]*?(?:import[\\s\\S]+?)(?=Generated Files:|Applying code|$)`, 'i');
      const fileContentMatch = response.match(fileContentRegex);
      if (fileContentMatch) {
        const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m);
        if (codeMatch) {
          const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
          sections.files.push({ path: filePath, content: codeMatch[1].trim() });
          console.log(`[apply-ai-code-stream] Extracted content for ${filePath}`);

          const filePackages = extractPackagesFromCode(codeMatch[1]);
          for (const pkg of filePackages) {
            if (!sections.packages.includes(pkg)) {
              sections.packages.push(pkg);
              console.log(`[apply-ai-code-stream] Package detected from imports: ${pkg}`);
            }
          }
        }
      }
    }
  }

  // Parse raw JSX/JS code blocks with file comments
  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/);
    if (fileNameMatch) {
      const fileName = fileNameMatch[1].trim();
      const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;

      if (!sections.files.some(f => f.path === filePath)) {
        sections.files.push({ path: filePath, content });

        const filePackages = extractPackagesFromCode(content);
        for (const pkg of filePackages) {
          if (!sections.packages.includes(pkg)) {
            sections.packages.push(pkg);
          }
        }
      }
    }
  }

  // Parse <command> tags
  const cmdRegex = /<command>(.*?)<\/command>/g;
  while ((match = cmdRegex.exec(response)) !== null) {
    sections.commands.push(match[1].trim());
  }

  // Parse <package> tags
  const pkgRegex = /<package>(.*?)<\/package>/g;
  while ((match = pkgRegex.exec(response)) !== null) {
    sections.packages.push(match[1].trim());
  }

  // Parse <packages> tag with multiple packages
  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/;
  const packagesMatch = response.match(packagesRegex);
  if (packagesMatch) {
    const packagesList = packagesMatch[1].trim()
      .split(/[\n,]+/)
      .map(pkg => pkg.trim())
      .filter(pkg => pkg.length > 0);
    sections.packages.push(...packagesList);
  }

  // Parse <structure> tag
  const structureMatch = /<structure>([\s\S]*?)<\/structure>/;
  const structResult = response.match(structureMatch);
  if (structResult) {
    sections.structure = structResult[1].trim();
  }

  // Parse <explanation> tag
  const explanationMatch = /<explanation>([\s\S]*?)<\/explanation>/;
  const explResult = response.match(explanationMatch);
  if (explResult) {
    sections.explanation = explResult[1].trim();
  }

  // Parse <template> tag
  const templateMatch = /<template>(.*?)<\/template>/;
  const templResult = response.match(templateMatch);
  if (templResult) {
    sections.template = templResult[1].trim();
  }

  return sections;
}

// ============================================================================
// Provider Resolution
// ============================================================================

async function resolveProvider(sandboxId: string | undefined): Promise<SandboxProvider | null> {
  // Try sandbox manager first
  let provider = sandboxId
    ? sandboxManager.getProvider(sandboxId)
    : sandboxManager.getActiveProvider();

  // Fall back to global state
  if (!provider) {
    provider = global.activeSandboxProvider;
  }

  // Try to get or create provider for specific sandboxId
  if (!provider && sandboxId) {
    console.log(`[apply-ai-code-stream] No provider found for sandbox ${sandboxId}, attempting to get or create...`);

    try {
      provider = await sandboxManager.getOrCreateProvider(sandboxId);

      if (!provider.getSandboxInfo()) {
        console.log(`[apply-ai-code-stream] Creating new sandbox since reconnection failed for ${sandboxId}`);
        await provider.createSandbox();
        await provider.setupViteApp();
        sandboxManager.registerSandbox(sandboxId, provider);
      }

      global.activeSandboxProvider = provider;
      console.log(`[apply-ai-code-stream] Successfully got provider for sandbox ${sandboxId}`);
    } catch (error) {
      console.error(`[apply-ai-code-stream] Failed to get or create provider for sandbox ${sandboxId}:`, error);
      return null;
    }
  }

  // Create a new sandbox if still no provider
  if (!provider) {
    console.log(`[apply-ai-code-stream] No active provider found, creating new sandbox...`);

    try {
      const { SandboxFactory } = await import('@/lib/sandbox/factory');
      provider = SandboxFactory.create();
      const sandboxInfo = await provider.createSandbox();
      await provider.setupViteApp();

      sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
      global.activeSandboxProvider = provider;
      global.sandboxData = {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url
      };

      console.log(`[apply-ai-code-stream] Created new sandbox successfully`);
    } catch (error) {
      console.error(`[apply-ai-code-stream] Failed to create new sandbox:`, error);
      return null;
    }
  }

  return provider;
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { response, isEdit = false, packages = [], sandboxId } = await request.json();

    if (!response) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 });
    }

    // Debug logging
    console.log('[apply-ai-code-stream] Received response to parse:');
    console.log('[apply-ai-code-stream] Response length:', response.length);
    console.log('[apply-ai-code-stream] Response preview:', response.substring(0, 500));
    console.log('[apply-ai-code-stream] isEdit:', isEdit);
    console.log('[apply-ai-code-stream] packages:', packages);

    // Parse AI response
    const parsed = parseAIResponse(response);
    const morphEnabled = Boolean(isEdit && process.env.MORPH_API_KEY);
    const morphEdits = morphEnabled ? parseMorphEdits(response) : [];

    console.log('[apply-ai-code-stream] Morph Fast Apply mode:', morphEnabled);
    if (morphEnabled) {
      console.log('[apply-ai-code-stream] Morph edits found:', morphEdits.length);
    }

    console.log('[apply-ai-code-stream] Parsed result:');
    console.log('[apply-ai-code-stream] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach(f => {
        console.log(`[apply-ai-code-stream] - ${f.path} (${f.content.length} chars)`);
      });
    }
    console.log('[apply-ai-code-stream] Packages found:', parsed.packages);

    // Initialize global state
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }

    // Resolve provider
    const provider = await resolveProvider(sandboxId);

    if (!provider) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create sandbox provider. The sandbox may have expired.',
        results: {
          filesCreated: [],
          packagesInstalled: [],
          commandsExecuted: [],
          errors: ['Sandbox provider creation failed']
        },
        explanation: parsed.explanation,
        structure: parsed.structure,
        parsedFiles: parsed.files,
        message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox creation failed.`
      }, { status: 500 });
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendProgress = async (data: ProgressEvent): Promise<void> => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    const closeWriter = async (): Promise<void> => {
      await writer.close();
    };

    // Start background processing
    processCodeApplication(
      provider,
      request,
      parsed,
      packages,
      morphEnabled,
      morphEdits,
      sandboxId,
      sendProgress,
      closeWriter
    );

    // Return stream immediately
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Apply AI code stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}
