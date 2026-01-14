/**
 * Template Cache Service
 * 
 * Caches downloaded GitHub templates to avoid repeated API calls and rate limiting.
 * Uses server-side memory cache with TTL (Time To Live).
 * 
 * In development: Cache persists across hot reloads via global state
 * In production: Cache lives for the lifetime of the serverless function
 */

import type { TemplateFile } from '@/types/template';

interface CachedTemplate {
  files: TemplateFile[];
  timestamp: number;
  repo: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Default TTL: 24 hours in milliseconds
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Global cache storage (persists across hot reloads in development)
declare global {
  var templateCache: Map<string, CachedTemplate> | undefined;
  var templateCacheStats: CacheStats | undefined;
}

class TemplateCacheService {
  private cache: Map<string, CachedTemplate>;
  private stats: CacheStats;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    // Use global cache in development to persist across hot reloads
    if (!global.templateCache) {
      global.templateCache = new Map();
    }
    if (!global.templateCacheStats) {
      global.templateCacheStats = { hits: 0, misses: 0, size: 0 };
    }
    
    this.cache = global.templateCache;
    this.stats = global.templateCacheStats;
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached template files for a repository
   * Returns null if not cached or expired
   */
  get(repo: string): TemplateFile[] | null {
    const cached = this.cache.get(repo);
    
    if (!cached) {
      this.stats.misses++;
      console.log(`[TemplateCache] MISS: ${repo} (not in cache)`);
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > this.ttlMs) {
      this.stats.misses++;
      console.log(`[TemplateCache] MISS: ${repo} (expired after ${Math.round(age / 1000 / 60)} minutes)`);
      this.cache.delete(repo);
      this.stats.size = this.cache.size;
      return null;
    }

    this.stats.hits++;
    const remainingTtl = Math.round((this.ttlMs - age) / 1000 / 60);
    console.log(`[TemplateCache] HIT: ${repo} (${cached.files.length} files, valid for ${remainingTtl} more minutes)`);
    return cached.files;
  }

  /**
   * Cache template files for a repository
   */
  set(repo: string, files: TemplateFile[]): void {
    this.cache.set(repo, {
      files,
      timestamp: Date.now(),
      repo,
    });
    this.stats.size = this.cache.size;
    console.log(`[TemplateCache] SET: ${repo} (${files.length} files, TTL: ${this.ttlMs / 1000 / 60} minutes)`);
  }

  /**
   * Check if a repository is cached (and not expired)
   */
  has(repo: string): boolean {
    const cached = this.cache.get(repo);
    if (!cached) return false;
    
    const age = Date.now() - cached.timestamp;
    return age <= this.ttlMs;
  }

  /**
   * Remove a specific template from cache
   */
  delete(repo: string): boolean {
    const result = this.cache.delete(repo);
    this.stats.size = this.cache.size;
    if (result) {
      console.log(`[TemplateCache] DELETE: ${repo}`);
    }
    return result;
  }

  /**
   * Clear all cached templates
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    console.log('[TemplateCache] CLEAR: All templates removed from cache');
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [repo, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.ttlMs) {
        this.cache.delete(repo);
        removed++;
      }
    }

    this.stats.size = this.cache.size;
    if (removed > 0) {
      console.log(`[TemplateCache] CLEANUP: Removed ${removed} expired entries`);
    }
    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: string; entries: string[] } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : 'N/A';
    
    return {
      ...this.stats,
      hitRate,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get detailed info about cached entries
   */
  getEntries(): Array<{ repo: string; fileCount: number; age: number; expiresIn: number }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([repo, cached]) => {
      const age = now - cached.timestamp;
      return {
        repo,
        fileCount: cached.files.length,
        age: Math.round(age / 1000 / 60), // minutes
        expiresIn: Math.round((this.ttlMs - age) / 1000 / 60), // minutes
      };
    });
  }
}

// Singleton instance
export const templateCache = new TemplateCacheService();

// Export for testing or custom TTL
export { TemplateCacheService, DEFAULT_TTL_MS };
