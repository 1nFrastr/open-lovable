import { NextRequest, NextResponse } from 'next/server';
import { templateCache } from '@/lib/templates/cache';

/**
 * GET /api/template-cache
 * 
 * Returns cache statistics and entries
 */
export async function GET() {
  const stats = templateCache.getStats();
  const entries = templateCache.getEntries();
  
  return NextResponse.json({
    stats,
    entries,
    ttlMinutes: 24 * 60, // 24 hours in minutes
  });
}

/**
 * DELETE /api/template-cache?repo=owner/repo
 * 
 * Clear cache - either specific repo or all
 * 
 * Query params:
 * - repo: Specific repository to clear (optional)
 * - expired: Set to 'true' to only clear expired entries
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get('repo');
  const expiredOnly = searchParams.get('expired') === 'true';

  if (expiredOnly) {
    const removed = templateCache.cleanup();
    return NextResponse.json({
      success: true,
      message: `Removed ${removed} expired cache entries`,
      removed,
    });
  }

  if (repo) {
    const deleted = templateCache.delete(repo);
    return NextResponse.json({
      success: deleted,
      message: deleted ? `Cleared cache for ${repo}` : `${repo} was not in cache`,
    });
  }

  // Clear all
  templateCache.clear();
  return NextResponse.json({
    success: true,
    message: 'All template cache cleared',
  });
}
