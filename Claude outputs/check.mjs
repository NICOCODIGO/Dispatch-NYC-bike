#!/usr/bin/env node
/**
 * Stop hook — the machine gate.
 *
 * Runs typecheck and tests every time Claude finishes a turn. Failures are fed
 * back so it fixes them itself; after MAX_STRIKES consecutive failures the hook
 * goes quiet, because a hook that always blocks turns a bad session into an
 * expensive infinite loop. Two strikes then it's a human problem — same rule as
 * the workflow doc.
 *
 * Node rather than bash: this repo is developed on Windows and a .sh hook needs
 * WSL or Git Bash. Node is already a dependency of the toolchain.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const stateDir = join(root, '.claude', '.state');
const stateFile = join(stateDir, 'check-strikes');
const MAX_STRIKES = 2;
const MAX_LINES = 25;

function run(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    return null;
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
  }
}

function head(text) {
  return text.split('\n').slice(0, MAX_LINES).join('\n');
}

function readStrikes() {
  return existsSync(stateFile) ? Number(readFileSync(stateFile, 'utf8')) || 0 : 0;
}

function writeStrikes(n) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, String(n));
}

const failures = [];

const typecheck = run('npm run -s typecheck');
if (typecheck) failures.push(`--- typecheck ---\n${head(typecheck)}`);

const tests = run('npm run -s test');
if (tests) failures.push(`--- tests ---\n${head(tests)}`);

if (failures.length === 0) {
  if (readStrikes() !== 0) writeStrikes(0);
  process.exit(0);
}

const strikes = readStrikes() + 1;
writeStrikes(strikes);

if (strikes > MAX_STRIKES) {
  // Stop feeding it back. Reverting and re-prompting is now cheaper than
  // another round of automated fixes.
  writeStrikes(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        systemMessage:
          `Machine gate still failing after ${MAX_STRIKES} fix attempts. ` +
          `Not feeding it back again — revert to the last clean commit and restart the task.`,
      },
    }),
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'Stop',
      systemMessage:
        `Machine gate failed (attempt ${strikes}/${MAX_STRIKES}). Fix before finishing:\n\n` +
        failures.join('\n\n'),
    },
  }),
);
process.exit(0);
