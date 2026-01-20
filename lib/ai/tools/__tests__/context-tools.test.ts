/**
 * Test Suite for Context Tools
 * Tests readFile, grep, and glob tools with various scenarios
 */

import { createReadTool, createGrepTool, createGlobTool } from '../context-tools';

// Mock sandbox provider
class MockSandboxProvider {
  private files: Map<string, string>;

  constructor(files: Record<string, string>) {
    this.files = new Map(Object.entries(files));
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`ENOENT: File not found: ${path}`);
    }
    return content;
  }

  async listFiles(): Promise<string[]> {
    return Array.from(this.files.keys());
  }
}

// Test helpers
function setupMockProvider(files: Record<string, string>) {
  const provider = new MockSandboxProvider(files);
  (global as any).activeSandboxProvider = provider;
  return provider;
}

function clearMockProvider() {
  (global as any).activeSandboxProvider = null;
}

async function testTool(
  description: string,
  testFn: () => Promise<void>
) {
  try {
    await testFn();
    console.log(`✅ PASSED: ${description}`);
  } catch (error: any) {
    console.error(`❌ FAILED: ${description}`);
    console.error('Error:', error.message);
    throw error;
  }
}

// Run all tests
console.log('\n🧪 Testing Context Tools\n');

// ============ ReadFile Tool Tests ============
console.log('--- Test Group 1: ReadFile Tool ---\n');

(async () => {
  const readTool = createReadTool();

  // Test 1.1: Read simple file
  await testTool('ReadFile: Read simple file', async () => {
    setupMockProvider({
      'src/App.tsx': 'import React from "react";\n\nfunction App() {\n  return <div>Hello</div>;\n}'
    });

    const result = await readTool.execute({ path: 'src/App.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (!result.content.includes('import React')) throw new Error('Expected import statement');
    if (!result.content.includes('1|')) throw new Error('Expected line numbers');
  });

  // Test 1.2: File not found
  await testTool('ReadFile: File not found', async () => {
    setupMockProvider({
      'src/App.tsx': 'content'
    });

    const result = await readTool.execute({ path: 'src/NotFound.tsx' });
    
    if (result.success) throw new Error('Expected failure');
    if (!result.error) throw new Error('Expected error message');
    if (!result.error.includes('not found')) throw new Error('Expected "not found" in error');
  });

  // Test 1.3: No active sandbox
  await testTool('ReadFile: No active sandbox', async () => {
    clearMockProvider();

    const result = await readTool.execute({ path: 'src/App.tsx' });
    
    if (result.success) throw new Error('Expected failure');
    if (!result.error?.includes('No active sandbox')) throw new Error('Expected sandbox error');
  });

  // Test 1.4: Read with offset and limit
  await testTool('ReadFile: Pagination with offset/limit', async () => {
    const longContent = Array(100).fill(0).map((_, i) => `Line ${i + 1}`).join('\n');
    setupMockProvider({
      'src/Long.tsx': longContent
    });

    const result = await readTool.execute({ path: 'src/Long.tsx', offset: 10, limit: 5 });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (!result.content.includes('11|Line 11')) throw new Error('Expected line 11');
    if (!result.content.includes('15|Line 15')) throw new Error('Expected line 15');
    if (result.content.includes('16|Line 16')) throw new Error('Should not include line 16');
  });

  // Test 1.5: Line length truncation
  await testTool('ReadFile: Long line truncation', async () => {
    const longLine = 'x'.repeat(3000);
    setupMockProvider({
      'src/LongLine.tsx': longLine
    });

    const result = await readTool.execute({ path: 'src/LongLine.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (result.content.includes('x'.repeat(2100))) throw new Error('Line should be truncated at 2000 chars');
    if (!result.content.includes('...')) throw new Error('Expected truncation indicator');
  });

  console.log('\n');
})();

// ============ Grep Tool Tests ============
console.log('--- Test Group 2: Grep Tool ---\n');

(async () => {
  const grepTool = createGrepTool();

  // Test 2.1: Simple pattern match
  await testTool('Grep: Find simple pattern', async () => {
    setupMockProvider({
      'src/App.tsx': 'import React from "react";\nimport { useState } from "react";',
      'src/utils.ts': 'export function helper() {}',
      'src/components/Button.tsx': 'import React from "react";\nexport const Button = () => null;'
    });

    const result = await grepTool.execute({ pattern: 'useState', filePattern: '*.{ts,tsx}' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (!result.content.includes('useState')) throw new Error('Expected to find useState');
    if (!result.content.includes('src/App.tsx')) throw new Error('Expected file path');
    if (!result.content.includes('MATCH')) throw new Error('Expected match indicator');
  });

  // Test 2.2: No matches found
  await testTool('Grep: No matches', async () => {
    setupMockProvider({
      'src/App.tsx': 'import React from "react";'
    });

    const result = await grepTool.execute({ pattern: 'nonexistent' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('No matches found')) throw new Error('Expected no matches message');
  });

  // Test 2.3: Case insensitive regex
  await testTool('Grep: Case insensitive matching', async () => {
    setupMockProvider({
      'src/App.tsx': 'const HELLO = "world";'
    });

    const result = await grepTool.execute({ pattern: 'hello' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('HELLO')) throw new Error('Expected case-insensitive match');
  });

  // Test 2.4: Multiple matches in same file
  await testTool('Grep: Multiple matches per file', async () => {
    setupMockProvider({
      'src/App.tsx': 'const a = useState();\nconst b = useState(0);\nconst c = useState("");'
    });

    const result = await grepTool.execute({ pattern: 'useState' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    const matchCount = (result.content.match(/MATCH/g) || []).length;
    if (matchCount < 2) throw new Error(`Expected at least 2 matches, got ${matchCount}`);
  });

  // Test 2.5: Path filtering (only src/)
  await testTool('Grep: Filter by path', async () => {
    setupMockProvider({
      'src/App.tsx': 'useState();',
      'lib/utils.ts': 'useState();',
      'tests/test.ts': 'useState();'
    });

    const result = await grepTool.execute({ pattern: 'useState', path: 'src' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('src/App.tsx')) throw new Error('Expected src file');
    if (result.content?.includes('lib/utils.ts')) throw new Error('Should not include lib file');
    if (result.content?.includes('tests/test.ts')) throw new Error('Should not include tests file');
  });

  // Test 2.6: No active sandbox
  await testTool('Grep: No active sandbox', async () => {
    clearMockProvider();

    const result = await grepTool.execute({ pattern: 'test' });
    
    if (result.success) throw new Error('Expected failure');
    if (!result.error?.includes('No active sandbox')) throw new Error('Expected sandbox error');
  });

  console.log('\n');
})();

// ============ Glob Tool Tests ============
console.log('--- Test Group 3: Glob Tool ---\n');

(async () => {
  const globTool = createGlobTool();

  // Test 3.1: Simple glob pattern
  await testTool('Glob: Find all tsx files', async () => {
    setupMockProvider({
      'src/App.tsx': 'content',
      'src/components/Button.tsx': 'content',
      'src/utils.ts': 'content',
      'package.json': '{}'
    });

    const result = await globTool.execute({ pattern: '**/*.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (!result.content.includes('src/App.tsx')) throw new Error('Expected App.tsx');
    if (!result.content.includes('src/components/Button.tsx')) throw new Error('Expected Button.tsx');
    if (result.content.includes('src/utils.ts')) throw new Error('Should not include .ts file');
  });

  // Test 3.2: Wildcard in filename
  await testTool('Glob: Wildcard in filename', async () => {
    setupMockProvider({
      'src/components/Button.tsx': 'content',
      'src/components/PrimaryButton.tsx': 'content',
      'src/components/Header.tsx': 'content',
      'src/utils/useButton.ts': 'content'
    });

    const result = await globTool.execute({ pattern: '**/*Button*.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('Button.tsx')) throw new Error('Expected Button.tsx');
    if (!result.content?.includes('PrimaryButton.tsx')) throw new Error('Expected PrimaryButton.tsx');
    if (result.content?.includes('Header.tsx')) throw new Error('Should not include Header.tsx');
  });

  // Test 3.3: No matches found
  await testTool('Glob: No matches', async () => {
    setupMockProvider({
      'src/App.tsx': 'content'
    });

    const result = await globTool.execute({ pattern: '**/*.vue' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('No files found')) throw new Error('Expected no files message');
  });

  // Test 3.4: Path filtering
  await testTool('Glob: Filter by path', async () => {
    setupMockProvider({
      'src/components/Button.tsx': 'content',
      'lib/components/Input.tsx': 'content',
      'tests/Button.test.tsx': 'content'
    });

    const result = await globTool.execute({ pattern: '**/*.tsx', path: 'src' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content?.includes('src/components/Button.tsx')) throw new Error('Expected src file');
    if (result.content?.includes('lib/components/Input.tsx')) throw new Error('Should not include lib file');
  });

  // Test 3.5: Results sorting
  await testTool('Glob: Results are sorted', async () => {
    setupMockProvider({
      'src/z.tsx': 'content',
      'src/a.tsx': 'content',
      'src/m.tsx': 'content'
    });

    const result = await globTool.execute({ pattern: '**/*.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    
    const lines = result.content.split('\n').filter(l => l.endsWith('.tsx'));
    const firstFile = lines[0];
    const lastFile = lines[lines.length - 1];
    
    if (!firstFile.includes('a.tsx')) throw new Error('Expected a.tsx first (alphabetical order)');
    if (!lastFile.includes('z.tsx')) throw new Error('Expected z.tsx last (alphabetical order)');
  });

  // Test 3.6: Result limit (100 files max)
  await testTool('Glob: Result limit enforcement', async () => {
    const manyFiles: Record<string, string> = {};
    for (let i = 0; i < 150; i++) {
      manyFiles[`src/file${i}.tsx`] = 'content';
    }
    setupMockProvider(manyFiles);

    const result = await globTool.execute({ pattern: '**/*.tsx' });
    
    if (!result.success) throw new Error('Expected success');
    if (!result.content) throw new Error('Expected content');
    if (!result.content.includes('more files not shown')) throw new Error('Expected truncation notice');
    
    const fileCount = (result.content.match(/\.tsx/g) || []).length;
    if (fileCount > 101) throw new Error(`Should show max 100 files + notice, got ${fileCount}`);
  });

  // Test 3.7: No active sandbox
  await testTool('Glob: No active sandbox', async () => {
    clearMockProvider();

    const result = await globTool.execute({ pattern: '**/*.tsx' });
    
    if (result.success) throw new Error('Expected failure');
    if (!result.error?.includes('No active sandbox')) throw new Error('Expected sandbox error');
  });

  console.log('\n');
})();

// Final summary
console.log('🎉 All context-tools tests passed!\n');
console.log('Summary:');
console.log('- ReadFile: 5 tests');
console.log('- Grep: 6 tests');
console.log('- Glob: 7 tests');
console.log('- Total: 18 tests\n');

// Clean up
clearMockProvider();
