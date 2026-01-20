# AI Tools Unit Tests

This directory contains unit tests for AI tools used in the open-lovable project.

## Test Files

### 1. `edit-file.test.ts`
Tests the edit file tool with 9 different matching strategies:
- Simple exact match
- Line-trimmed matching
- Block anchor matching
- Whitespace normalized matching
- Indentation flexible matching
- Escape normalized matching
- Trimmed boundary matching
- Context-aware matching
- Multi-occurrence matching

### 2. `context-tools.test.ts` (NEW)
Tests the context exploration tools:

**ReadFile Tool (5 tests)**:
- ✅ Read simple file
- ✅ File not found error handling
- ✅ No active sandbox error handling
- ✅ Pagination with offset/limit
- ✅ Long line truncation (2000 chars max)

**Grep Tool (6 tests)**:
- ✅ Find simple pattern
- ✅ No matches found
- ✅ Case insensitive matching
- ✅ Multiple matches per file
- ✅ Path filtering (src/ only)
- ✅ No active sandbox error handling

**Glob Tool (7 tests)**:
- ✅ Find all files by extension
- ✅ Wildcard in filename
- ✅ No matches found
- ✅ Path filtering
- ✅ Results sorting (alphabetical)
- ✅ Result limit enforcement (100 files max)
- ✅ No active sandbox error handling

**Total: 18 tests**

## Running Tests

### Run all context-tools tests:
```bash
pnpm run test:tools
```

### Run edit-file tests:
```bash
pnpm run test:edit
```

### Run all tests:
```bash
pnpm run test:all
```

## Test Structure

Each test uses a mock sandbox provider to simulate file system operations:

```typescript
class MockSandboxProvider {
  private files: Map<string, string>;
  
  async readFile(path: string): Promise<string> { ... }
  async listFiles(): Promise<string[]> { ... }
}
```

This allows testing without requiring an actual E2B or Vercel sandbox.

## Test Coverage

### ReadFile Tool
- ✅ Normal file reading
- ✅ Line numbering
- ✅ Pagination (offset/limit)
- ✅ Long line truncation
- ✅ Error handling (file not found, no sandbox)

### Grep Tool
- ✅ Pattern matching (regex support)
- ✅ Case insensitive search
- ✅ Multiple matches per file
- ✅ File type filtering
- ✅ Path filtering
- ✅ Context lines (2 before, 2 after)
- ✅ Result limiting (50 matches max)
- ✅ Error handling

### Glob Tool
- ✅ Glob pattern matching
- ✅ Wildcard support (*, **, ?, [...])
- ✅ Path filtering
- ✅ Alphabetical sorting
- ✅ Result limiting (100 files max)
- ✅ Error handling

## Adding New Tests

To add a new test:

1. Define the test scenario
2. Setup mock provider with test data
3. Execute the tool
4. Assert expected results
5. Use the `testTool()` helper for consistent error handling

Example:

```typescript
await testTool('My test description', async () => {
  setupMockProvider({
    'src/App.tsx': 'test content'
  });

  const result = await myTool.execute({ ... });
  
  if (!result.success) throw new Error('Expected success');
  // Add more assertions...
});
```

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# .github/workflows/test.yml
- name: Run unit tests
  run: |
    pnpm install
    pnpm run test:tools
    pnpm run test:edit
```

## Debugging

To debug a failing test:

1. Check the console output for detailed error messages
2. Look at the mock provider setup
3. Verify expected vs actual results
4. Add console.log statements in the tool code if needed

## Performance

All tests run in < 2 seconds:
- No real sandbox creation
- Mock file system operations
- Parallel test execution where possible
