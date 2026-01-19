/**
 * Package Detector Module
 * 
 * Extracts package dependencies from code by analyzing import statements.
 * Filters out built-in packages and relative imports.
 */

/**
 * Extract npm packages from import statements in code
 * 
 * @param content - Code content to analyze
 * @returns Array of package names (including scoped packages like @heroicons/react)
 */
export function extractPackagesFromCode(content: string): string[] {
  const packages: string[] = [];
  
  // Match ES6 imports
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let importMatch;
  
  while ((importMatch = importRegex.exec(content)) !== null) {
    const importPath = importMatch[1];
    
    // Skip relative imports and built-in React
    if (!importPath.startsWith('.') && 
        !importPath.startsWith('/') && 
        importPath !== 'react' && 
        importPath !== 'react-dom' &&
        !importPath.startsWith('@/')) {
      
      // Extract package name (handle scoped packages like @heroicons/react)
      const packageName = importPath.startsWith('@') 
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];
      
      if (!packages.includes(packageName)) {
        packages.push(packageName);
      }
    }
  }
  
  return packages;
}

/**
 * Extract packages from multiple files
 * 
 * @param files - Array of file objects with path and content
 * @returns Deduplicated array of package names
 */
export function extractPackagesFromFiles(
  files: Array<{ path: string; content: string }>
): string[] {
  const allPackages: string[] = [];
  
  for (const file of files) {
    const filePackages = extractPackagesFromCode(file.content);
    for (const pkg of filePackages) {
      if (!allPackages.includes(pkg)) {
        allPackages.push(pkg);
      }
    }
  }
  
  return allPackages;
}
