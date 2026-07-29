import { mkdirSync } from 'node:fs';
import { run } from './lib.mjs';

const wasmPath = 'target/wasm32-unknown-unknown/release/arena.wasm';
const outputDir = 'packages/contracts/counter/src/generated';

run('stellar', ['contract', 'build', '--package', 'arena', '--out-dir', 'target/wasm32-unknown-unknown/release']);
mkdirSync(outputDir, { recursive: true });
run('stellar', ['contract', 'bindings', 'typescript', '--wasm', wasmPath, '--output-dir', outputDir, '--overwrite']);
