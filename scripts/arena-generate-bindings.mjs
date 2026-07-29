import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './lib.mjs';

const wasmPath = 'target/wasm32-unknown-unknown/release/arena.wasm';
const outputDir = 'packages/arena-bindings/src/generated';
const packageJsonPath = `${outputDir}/package.json`;

run('stellar', ['contract', 'build', '--package', 'arena', '--out-dir', 'target/wasm32-unknown-unknown/release']);
mkdirSync(outputDir, { recursive: true });
run('stellar', ['contract', 'bindings', 'typescript', '--wasm', wasmPath, '--output-dir', outputDir, '--overwrite']);

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
packageJson.name = '@punch-arena/arena-bindings-generated';
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
