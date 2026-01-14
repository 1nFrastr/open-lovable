import { NextResponse } from 'next/server';
import { parseJavaScriptFile, buildComponentTree } from '@/lib/file-parser';
import { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest';
import { SandboxProvider } from '@/lib/sandbox/types';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: SandboxProvider | null;
  var sandboxState: any;
}

export async function GET() {
  try {
    // Support both legacy activeSandbox and new activeSandboxProvider
    const provider = global.activeSandboxProvider;
    const legacySandbox = global.activeSandbox;
    
    if (!provider && !legacySandbox) {
      console.log('[get-sandbox-files] No active sandbox found');
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 404 });
    }

    console.log('[get-sandbox-files] Fetching and analyzing file structure...');
    console.log('[get-sandbox-files] Using provider:', !!provider, 'Legacy sandbox:', !!legacySandbox);
    
    let fileList: string[] = [];
    
    // Use provider's listFiles method if available
    if (provider) {
      try {
        fileList = await provider.listFiles();
        console.log('[get-sandbox-files] Provider returned', fileList.length, 'files');
      } catch (e) {
        console.error('[get-sandbox-files] Provider listFiles failed:', e);
        // Fall through to legacy method
      }
    }
    
    // Fallback to legacy method
    if (fileList.length === 0 && legacySandbox) {
      const findResult = await legacySandbox.runCommand({
        cmd: 'find',
        args: [
          '.',
          '-name', 'node_modules', '-prune', '-o',
          '-name', '.git', '-prune', '-o',
          '-name', 'dist', '-prune', '-o',
          '-name', 'build', '-prune', '-o',
          '-type', 'f',
          '(',
          '-name', '*.jsx',
          '-o', '-name', '*.js',
          '-o', '-name', '*.tsx',
          '-o', '-name', '*.ts',
          '-o', '-name', '*.css',
          '-o', '-name', '*.json',
          ')',
          '-print'
        ]
      });
      
      if (findResult.exitCode !== 0) {
        throw new Error('Failed to list files');
      }
      
      fileList = (await findResult.stdout()).split('\n').filter((f: string) => f.trim());
    }
    
    // Filter to only relevant file types
    fileList = fileList.filter((f: string) => {
      const ext = f.split('.').pop()?.toLowerCase();
      return ['jsx', 'js', 'tsx', 'ts', 'css', 'json', 'html'].includes(ext || '');
    });
    
    console.log('[get-sandbox-files] Found', fileList.length, 'files after filtering');
    
    // Read content of each file (limit to reasonable sizes)
    const filesContent: Record<string, string> = {};
    
    for (const filePath of fileList) {
      try {
        // Remove leading './' from path
        const relativePath = filePath.replace(/^\.\//, '');
        
        // Skip node_modules and other unwanted paths
        if (relativePath.includes('node_modules') || relativePath.includes('.git')) {
          continue;
        }
        
        let content: string | null = null;
        
        // Use provider's readFile method if available
        if (provider) {
          try {
            content = await provider.readFile(relativePath);
          } catch (e) {
            // File might not exist or be unreadable
            continue;
          }
        } else if (legacySandbox) {
          // Legacy method: check file size first
          const statResult = await legacySandbox.runCommand({
            cmd: 'stat',
            args: ['-f', '%z', filePath]
          });
          
          if (statResult.exitCode === 0) {
            const fileSize = parseInt(await statResult.stdout());
            
            // Only read files smaller than 10KB
            if (fileSize < 10000) {
              const catResult = await legacySandbox.runCommand({
                cmd: 'cat',
                args: [filePath]
              });
              
              if (catResult.exitCode === 0) {
                content = await catResult.stdout();
              }
            }
          }
        }
        
        if (content !== null) {
          filesContent[relativePath] = content;
        }
      } catch (parseError) {
        console.debug('Error reading file:', filePath, parseError);
        // Skip files that can't be read
        continue;
      }
    }
    
    // Get directory structure
    let structure = '';
    
    if (provider) {
      // Build structure from file list
      const dirs = new Set<string>();
      for (const file of fileList) {
        const parts = file.split('/');
        let path = '';
        for (let i = 0; i < parts.length - 1; i++) {
          path = path ? `${path}/${parts[i]}` : parts[i];
          if (!path.includes('node_modules') && !path.includes('.git')) {
            dirs.add(path);
          }
        }
      }
      structure = Array.from(dirs).slice(0, 50).join('\n');
    } else if (legacySandbox) {
      const treeResult = await legacySandbox.runCommand({
        cmd: 'find',
        args: ['.', '-type', 'd', '-not', '-path', '*/node_modules*', '-not', '-path', '*/.git*']
      });
      
      if (treeResult.exitCode === 0) {
        const dirs = (await treeResult.stdout()).split('\n').filter((d: string) => d.trim());
        structure = dirs.slice(0, 50).join('\n'); // Limit to 50 lines
      }
    }
    
    // Build enhanced file manifest
    const fileManifest: FileManifest = {
      files: {},
      routes: [],
      componentTree: {},
      entryPoint: '',
      styleFiles: [],
      timestamp: Date.now(),
    };
    
    // Process each file
    for (const [relativePath, content] of Object.entries(filesContent)) {
      const fullPath = `/${relativePath}`;
      
      // Create base file info
      const fileInfo: FileInfo = {
        content: content,
        type: 'utility',
        path: fullPath,
        relativePath,
        lastModified: Date.now(),
      };
      
      // Parse JavaScript/JSX files
      if (relativePath.match(/\.(jsx?|tsx?)$/)) {
        const parseResult = parseJavaScriptFile(content, fullPath);
        Object.assign(fileInfo, parseResult);
        
        // Identify entry point
        if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
          fileManifest.entryPoint = fullPath;
        }
        
        // Identify App.jsx
        if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
          fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
        }
      }
      
      // Track style files
      if (relativePath.endsWith('.css')) {
        fileManifest.styleFiles.push(fullPath);
        fileInfo.type = 'style';
      }
      
      fileManifest.files[fullPath] = fileInfo;
    }
    
    // Build component tree
    fileManifest.componentTree = buildComponentTree(fileManifest.files);
    
    // Extract routes (simplified - looks for Route components or page pattern)
    fileManifest.routes = extractRoutes(fileManifest.files);
    
    // Update global file cache with manifest
    if (global.sandboxState?.fileCache) {
      global.sandboxState.fileCache.manifest = fileManifest;
    }

    return NextResponse.json({
      success: true,
      files: filesContent,
      structure,
      fileCount: Object.keys(filesContent).length,
      manifest: fileManifest,
    });

  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Look for React Router usage
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      // Extract route definitions (simplified)
      const routeMatches = fileInfo.content.matchAll(/path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g);
      
      for (const match of routeMatches) {
        const [, routePath] = match;
        // componentRef available in match but not used currently
        routes.push({
          path: routePath,
          component: path,
        });
      }
    }
    
    // Check for Next.js style pages
    if (fileInfo.relativePath.startsWith('pages/') || fileInfo.relativePath.startsWith('src/pages/')) {
      const routePath = '/' + fileInfo.relativePath
        .replace(/^(src\/)?pages\//, '')
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/index$/, '');
        
      routes.push({
        path: routePath,
        component: path,
      });
    }
  }
  
  return routes;
}