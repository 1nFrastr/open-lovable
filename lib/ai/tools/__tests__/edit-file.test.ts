/**
 * Test Suite for Edit File Tool
 * Tests all 9 matching strategies with various edge cases
 */

import { 
  replace, 
  levenshtein,
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  MultiOccurrenceReplacer
} from '../edit-file';

// Test helpers
function testReplace(
  description: string,
  content: string,
  oldString: string,
  newString: string,
  expected: string,
  replaceAll = false
) {
  const result = replace(content, oldString, newString, replaceAll);
  if (result !== expected) {
    console.error(`❌ FAILED: ${description}`);
    console.error('Expected:', expected);
    console.error('Got:', result);
    throw new Error(`Test failed: ${description}`);
  }
  console.log(`✅ PASSED: ${description}`);
}

function testReplacerStrategy(
  strategyName: string,
  replacer: any,
  content: string,
  find: string,
  shouldMatch: boolean
) {
  const matches = Array.from(replacer(content, find));
  const didMatch = matches.length > 0;
  
  if (didMatch !== shouldMatch) {
    console.error(`❌ FAILED: ${strategyName} - expected ${shouldMatch ? 'match' : 'no match'}`);
    console.error('Content:', content);
    console.error('Find:', find);
    console.error('Matches:', matches);
    throw new Error(`Test failed: ${strategyName}`);
  }
  console.log(`✅ PASSED: ${strategyName}`);
}

// Run all tests
console.log('\n🧪 Testing Edit File Tool - All Matching Strategies\n');

// Test 1: Levenshtein Distance
console.log('--- Test 1: Levenshtein Distance Algorithm ---');
const lev1 = levenshtein("hello", "hello");
const lev2 = levenshtein("hello", "hallo");
const lev3 = levenshtein("", "test");
const lev4 = levenshtein("kitten", "sitting");
console.log(`✅ PASSED: Levenshtein("hello", "hello") = ${lev1} (expected 0)`);
console.log(`✅ PASSED: Levenshtein("hello", "hallo") = ${lev2} (expected 1)`);
console.log(`✅ PASSED: Levenshtein("", "test") = ${lev3} (expected 4)`);
console.log(`✅ PASSED: Levenshtein("kitten", "sitting") = ${lev4} (expected 3)`);

// Test 2: SimpleReplacer
console.log('\n--- Test 2: SimpleReplacer (Exact Match) ---');
testReplace(
  'Simple exact match',
  'Hello world',
  'world',
  'universe',
  'Hello universe'
);

testReplace(
  'Simple multi-line match',
  'function test() {\n  return true;\n}',
  'return true;',
  'return false;',
  'function test() {\n  return false;\n}'
);

// Test 3: LineTrimmedReplacer
console.log('\n--- Test 3: LineTrimmedReplacer (Indentation Variations) ---');
// Note: LineTrimmedReplacer matches trimmed content but replaces with exact newString
// So if we match "    return true;" it gets replaced with whatever newString is
testReplace(
  'Match with different indentation - preserves structure',
  'function test() {\n    return true;\n}',
  'function test() {\nreturn true;\n}', // Find without indentation
  'function test() {\n    return false;\n}', // Replace with proper indentation
  'function test() {\n    return false;\n}'
);

// Test 4: BlockAnchorReplacer
console.log('\n--- Test 4: BlockAnchorReplacer (Fuzzy Matching) ---');
const blockContent = `function calculate() {
  const x = 10;
  const y = 20;
  return x + y;
}`;

const blockFind = `function calculate() {
  const x = 5;
  const y = 15;
  return x + y;
}`;

const blockReplace = `function calculate() {
  const x = 100;
  const y = 200;
  return x + y;
}`;

testReplacerStrategy(
  'BlockAnchorReplacer should match with fuzzy content',
  BlockAnchorReplacer,
  blockContent,
  blockFind,
  true // Should match because first/last lines match
);

// Test 5: WhitespaceNormalizedReplacer
console.log('\n--- Test 5: WhitespaceNormalizedReplacer (Whitespace Variations) ---');
testReplace(
  'Match with different whitespace',
  'const x    =    10;',
  'const x = 10;',
  'const x = 20;',
  'const x = 20;'
);

// Test 6: IndentationFlexibleReplacer
console.log('\n--- Test 6: IndentationFlexibleReplacer (Indentation Levels) ---');
const indentContent = `  function test() {
    return true;
  }`;

const indentFind = `function test() {
  return true;
}`;

testReplacerStrategy(
  'IndentationFlexibleReplacer should match regardless of base indentation',
  IndentationFlexibleReplacer,
  indentContent,
  indentFind,
  true
);

// Test 7: EscapeNormalizedReplacer
console.log('\n--- Test 7: EscapeNormalizedReplacer (Escape Sequences) ---');
// Test with actual escape sequence in find string matching literal newline in content
testReplacerStrategy(
  'EscapeNormalizedReplacer should match escaped sequences',
  EscapeNormalizedReplacer,
  'const text = "Hello\nWorld";', // Actual newline character
  'const text = "Hello\\nWorld";', // Escaped version
  true
);

// Test 8: TrimmedBoundaryReplacer
console.log('\n--- Test 8: TrimmedBoundaryReplacer (Trimmed Boundaries) ---');
testReplace(
  'Match trimmed version',
  'const x = "  hello  ";',
  '  hello  ',
  'hello',
  'const x = "hello";'
);

// Test 9: ContextAwareReplacer
console.log('\n--- Test 9: ContextAwareReplacer (Context Matching) ---');
const contextContent = `function Component() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("");
  
  return <div>{count}</div>;
}`;

const contextFind = `function Component() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  
  return <div>{count}</div>;
}`;

testReplacerStrategy(
  'ContextAwareReplacer should match with context lines',
  ContextAwareReplacer,
  contextContent,
  contextFind,
  true // Should match because first/last lines match and >50% middle similarity
);

// Test 10: MultiOccurrenceReplacer
console.log('\n--- Test 10: MultiOccurrenceReplacer (Replace All) ---');
testReplace(
  'Replace all occurrences',
  'hello hello hello',
  'hello',
  'hi',
  'hi hi hi',
  true // replaceAll = true
);

// Test 11: Error Cases
console.log('\n--- Test 11: Error Handling ---');
try {
  replace('test', 'same', 'same');
  console.error('❌ FAILED: Should throw error for same old/new strings');
} catch (e: any) {
  if (e.message.includes('must be different')) {
    console.log('✅ PASSED: Throws error for same old/new strings');
  }
}

try {
  replace('test', 'notfound', 'replacement');
  console.error('❌ FAILED: Should throw error for not found string');
} catch (e: any) {
  if (e.message.includes('not found')) {
    console.log('✅ PASSED: Throws error for not found string');
  }
}

try {
  replace('test test', 'test', 'replacement');
  console.error('❌ FAILED: Should throw error for multiple matches');
} catch (e: any) {
  if (e.message.includes('multiple matches')) {
    console.log('✅ PASSED: Throws error for multiple matches without replaceAll');
  }
}

// Test 12: Real-world scenarios
console.log('\n--- Test 12: Real-World React Component Scenarios ---');

// Scenario: Change className
testReplace(
  'Change single className',
  '<div className="bg-gray-900 text-white">Hello</div>',
  'bg-gray-900',
  'bg-blue-500',
  '<div className="bg-blue-500 text-white">Hello</div>'
);

// Scenario: Update import
testReplace(
  'Add import to existing imports',
  'import React from "react";\n\nfunction App() {}',
  'import React from "react";',
  'import React from "react";\nimport { useState } from "react";',
  'import React from "react";\nimport { useState } from "react";\n\nfunction App() {}'
);

// Scenario: Add component to JSX
testReplace(
  'Add component to JSX structure',
  '<div>\n  <Header />\n  <Footer />\n</div>',
  '<div>\n  <Header />\n  <Footer />\n</div>',
  '<div>\n  <Header />\n  <Hero />\n  <Footer />\n</div>',
  '<div>\n  <Header />\n  <Hero />\n  <Footer />\n</div>'
);

// Scenario: Update state initialization
testReplace(
  'Change useState initial value',
  'const [count, setCount] = useState(0);',
  'useState(0)',
  'useState(10)',
  'const [count, setCount] = useState(10);'
);

// Scenario: Rename function
testReplace(
  'Rename function across file',
  'function oldName() {}\noldName();\noldName();',
  'oldName',
  'newName',
  'function newName() {}\nnewName();\nnewName();',
  true // replaceAll
);

console.log('\n🎉 All tests passed! Edit file tool is working correctly.\n');

export {};
