import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type Mode = 'node' | 'bun';
interface Config {
  sourceFile: string;
  targetFile: string;
  exportName: string;
  sourceLabel: string;
  regenCmd: string;
}

const MODES: Record<Mode, Config> = {
  node: {
    sourceFile: 'node-worker.ts',
    targetFile: 'node-worker-code.ts',
    exportName: 'getNodeWorkerCode',
    sourceLabel: 'node-worker.ts',
    regenCmd: 'npx tsx scripts/generate-worker-code.ts',
  },
  bun: {
    sourceFile: 'bun-worker.ts',
    targetFile: 'bun-worker-code.ts',
    exportName: 'getBunWorkerCode',
    sourceLabel: 'bun-worker.ts',
    regenCmd: 'npx tsx scripts/generate-worker-code.ts --bun',
  },
};

function getMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes('--bun')) return 'bun';
  return 'node';
}

const mode = getMode();
const cfg = MODES[mode];

const SOURCE = join(__dirname, '..', 'src', 'async', cfg.sourceFile);
const TARGET = join(__dirname, '..', 'src', 'async', cfg.targetFile);

function transform(source: string): string {
  let code = source;
  const lines = code.split('\n');

  // Track whether we're in the copyright header
  let result: string[] = [];
  let inCopyright = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let trimmed = line.trim();

    // Skip copyright header
    if (trimmed.startsWith('/*')) { inCopyright = true; continue; }
    if (trimmed.startsWith('*')) { if (trimmed.endsWith('*/')) inCopyright = false; continue; }
    if (inCopyright) { if (trimmed.endsWith('*/')) inCopyright = false; continue; }

    // Skip blank lines at the start
    if (trimmed === '' && result.length === 0) continue;

    // Skip standalone declare var/const/let (pure type declarations, no assignment)
    if (/^declare\s+(var|const|let)\s+\w+/.test(trimmed) && !trimmed.includes('=')) continue;

    // Skip import type statements entirely
    if (/^import\s+type\s/.test(trimmed)) continue;
    if (/^import\s+\{[\s\w,]+}\s+from/.test(trimmed) && trimmed.includes('import')) {
      // Only skip if it's just an import type (but we already handled import type above)
    }

    // Transform ESM imports to CJS requires
    const importMatch = trimmed.match(/^import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'([^']+)'/);
    if (importMatch) {
      if (importMatch[1]) {
        result.push('var {' + importMatch[1] + "} = require('" + importMatch[3] + "');");
      } else {
        result.push('var ' + importMatch[2] + " = require('" + importMatch[3] + "');");
      }
      continue;
    }

    // Transform line: remove all TypeScript-specific syntax
    let l = line;

    // 1. Remove declare var/const/let
    l = l.replace(/\bdeclare\s+(var|const|let)\s+/g, 'var ');

    // 2. Remove export keyword (export function, export class, export default, export type)
    l = l.replace(/\bexport\s+(default\s+)?/g, '');

    // 3. Replace let/const with var (at any level)
    l = l.replace(/\blet\s+/g, 'var ');
    l = l.replace(/\bconst\s+/g, 'var ');

    // 4. Remove non-null assertions: foo! -> foo (but keep !! for negation)
    l = l.replace(/(\w+)!(?=[.\])\[,;:\s}])/g, '$1');

    // 5. Remove type annotations from variable declarations:
    //    var x: Type  ->  var x
    //    var x: Type<X, Y>  ->  var x
    //    var x: string | null  ->  var x
    //    var x: string[]  ->  var x
    l = l.replace(/(var\s+\w+)\s*:\s*[^=;]+\s*([=;])/g, '$1 $2');

    // 6. Remove type annotations from function parameters:
    //    function foo(param: Type)  ->  function foo(param)
    //    (param: Type)  ->  (param)
    // Only applies after function keyword or catch keyword
    l = l.replace(/(function\s+\w+\s*\()([^)]*)\)/g, (match, before, params) => {
      const cleaned = params.replace(/(\w+)\s*:\s*[A-Za-z<>[\]|&,\s]+/g, '$1');
      return before + cleaned + ')';
    });
    l = l.replace(/catch\s*\((\w+)\s*:\s*\w+\s*\)/g, 'catch ($1)');
    // Remove parameter type from arrow functions: (msg: any) -> (msg)
    l = l.replace(/\((\w+)\s*:\s*(string|number|boolean|bigint|any|void)\)/g, '($1)');

    // 7. Remove return type annotations on functions:
    //    function foo(...): Type  ->  function foo(...)
    l = l.replace(/(function\s+\w+\s*\([^)]*\))\s*:\s*[A-Za-z<>[\]|&,{}\s]+(\s*\{)/g, '$1$2');

    // 8. Remove standalone type annotations: `): void {` -> `) {`
    l = l.replace(/\)\s*:\s*[A-Za-z<>[\]|&,\s]+(\s*\{)/g, ')$1');

    // 9. Remove type annotations in catch: catch (e)  (already handled by step 6)

    // 10. Remove `as Type` assertions
    l = l.replace(/\s+as\s+[A-Za-z<>[\]|&,]+/g, '');

    result.push(l);
  }

  // Clean up: remove consecutive blank lines and lines with only whitespace
  let cleaned: string[] = [];
  let prevBlank = false;
  for (const l of result) {
    const isEmpty = l.trim() === '';
    if (isEmpty && prevBlank) continue;
    cleaned.push(l);
    prevBlank = isEmpty;
  }

  return cleaned.join('\n');
}

function main(): void {
  const source = readFileSync(SOURCE, 'utf-8');
  let transformed = transform(source);

  // Verify no TS remains
  const hasTSSyntax =
    /\b(interface|type)\s+\w/.test(transformed) ||
    /:\s*(string|number|boolean|bigint)\s*=/.test(transformed);

  if (hasTSSyntax) {
    console.warn('Warning: possible remaining TypeScript syntax in generated output');
  }

  const output = `/*
 * Copyright (c) 2026 TT23XR Studio
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * AUTO-GENERATED from src/async/${cfg.sourceLabel} — DO NOT EDIT MANUALLY.
 * Regenerate with: ${cfg.regenCmd}
 */

export function ${cfg.exportName}(): string {
  return \`
${transformed}
\`;
}
`;

  writeFileSync(TARGET, output, 'utf-8');
  console.log(`[${mode}] Generated: ${TARGET}`);
}

main();
