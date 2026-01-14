import { NextRequest, NextResponse } from 'next/server';
import type { TemplateFile, DownloadTemplateResponse } from '@/types/template';
import { shouldExcludeFile, isLockFile } from '@/lib/template-project';
import { templateCache } from '@/lib/templates/cache';

/**
 * Maximum file size for non-lock files (100KB)
 */
const MAX_FILE_SIZE = 100 * 1024;

/**
 * Batch size for parallel file fetching
 */
const BATCH_SIZE = 10;

/**
 * GET /api/download-template?repo=owner/repo&noCache=true
 * 
 * Downloads all files from a GitHub repository template.
 * Uses server-side cache with 24h TTL to avoid GitHub API rate limiting.
 * 
 * Query params:
 * - repo: GitHub repository in 'owner/repo' format (required)
 * - noCache: Set to 'true' to bypass cache and force fresh download
 */
export async function GET(request: NextRequest): Promise<NextResponse<DownloadTemplateResponse | TemplateFile[]>> {
  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get('repo');
  const noCache = searchParams.get('noCache') === 'true';

  if (!repo) {
    return NextResponse.json(
      { files: [], error: 'Repository name is required (e.g., ?repo=owner/repo)' },
      { status: 400 }
    );
  }

  try {
    // Check cache first (unless noCache is set)
    if (!noCache) {
      const cachedFiles = templateCache.get(repo);
      if (cachedFiles) {
        console.log(`[download-template] Returning cached template: ${repo} (${cachedFiles.length} files)`);
        return NextResponse.json(cachedFiles, {
          headers: { 'X-Cache': 'HIT' }
        });
      }
    }

    console.log('[download-template] Fetching template from GitHub:', repo);
    
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
    
    const files = await fetchRepositoryContents(repo, githubToken);
    
    console.log(`[download-template] Downloaded ${files.length} files from ${repo}`);
    
    // Cache the downloaded files
    if (files.length > 0) {
      templateCache.set(repo, files);
    }
    
    // Return files array directly for compatibility with bolt.diy format
    return NextResponse.json(files, {
      headers: { 'X-Cache': 'MISS' }
    });
    
  } catch (error) {
    console.error('[download-template] Error:', error);
    return NextResponse.json(
      { files: [], error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

/**
 * Fetch repository contents using GitHub API
 */
async function fetchRepositoryContents(repo: string, githubToken?: string): Promise<TemplateFile[]> {
  const baseUrl = 'https://api.github.com';
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'open-lovable-app',
    ...(githubToken ? { 'Authorization': `Bearer ${githubToken}` } : {}),
  };

  // Get repository info to find default branch
  const repoResponse = await fetch(`${baseUrl}/repos/${repo}`, { headers });
  
  if (!repoResponse.ok) {
    if (repoResponse.status === 404) {
      throw new Error(`Repository not found: ${repo}`);
    }
    if (repoResponse.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Please add a GITHUB_TOKEN to your environment.');
    }
    throw new Error(`GitHub API error: ${repoResponse.status}`);
  }

  const repoData = await repoResponse.json() as { default_branch: string };
  const defaultBranch = repoData.default_branch;

  console.log(`[download-template] Using branch: ${defaultBranch}`);

  // Get the tree recursively
  const treeResponse = await fetch(
    `${baseUrl}/repos/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers }
  );

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch repository tree: ${treeResponse.status}`);
  }

  const treeData = await treeResponse.json() as {
    tree: Array<{ path: string; type: string; size?: number; sha: string }>
  };

  // Filter files
  const filesToFetch = treeData.tree.filter(item => {
    // Only include blob (file) types
    if (item.type !== 'blob') return false;
    
    // Exclude .git and .bolt directories
    if (shouldExcludeFile(item.path)) return false;
    
    // Check file size for non-lock files
    const isLock = isLockFile(item.path);
    if (!isLock && item.size && item.size > MAX_FILE_SIZE) {
      console.log(`[download-template] Skipping large file: ${item.path} (${item.size} bytes)`);
      return false;
    }
    
    return true;
  });

  console.log(`[download-template] Fetching ${filesToFetch.length} files...`);

  // Fetch file contents in batches
  const files: TemplateFile[] = [];
  
  for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
    const batch = filesToFetch.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (file): Promise<TemplateFile | null> => {
        try {
          const contentResponse = await fetch(
            `${baseUrl}/repos/${repo}/contents/${file.path}`,
            { headers }
          );

          if (!contentResponse.ok) {
            console.warn(`[download-template] Failed to fetch ${file.path}: ${contentResponse.status}`);
            return null;
          }

          const contentData = await contentResponse.json() as { content: string; encoding: string };
          
          // Decode base64 content
          let content: string;
          if (contentData.encoding === 'base64') {
            content = Buffer.from(contentData.content, 'base64').toString('utf-8');
          } else {
            content = contentData.content;
          }

          return {
            name: file.path.split('/').pop() || '',
            path: file.path,
            content,
          };
        } catch (error) {
          console.warn(`[download-template] Error fetching ${file.path}:`, error);
          return null;
        }
      })
    );

    // Add successful results to files array
    files.push(...batchResults.filter((f): f is TemplateFile => f !== null));

    // Add a small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < filesToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return files;
}
