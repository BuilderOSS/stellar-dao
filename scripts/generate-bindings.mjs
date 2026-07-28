import { mkdirSync } from 'node:fs';
import { run } from './lib.mjs';

const wasmPath = 'target/wasm32-unknown-unknown/release/counter.wasm';
const outputDir = 'packages/contracts/counter/src/generated';

run('stellar', ['contract', 'build', '--package', 'counter', '--out-dir', 'target/wasm32-unknown-unknown/release']);
mkdirSync(outputDir, { recursive: true });
run('stellar', ['contract', 'bindings', 'typescript', '--wasm', wasmPath, '--output-dir', outputDir, '--overwrite']);
