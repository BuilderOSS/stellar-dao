import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './lib.mjs';

const buildDir = 'target/wasm32v1-none/release';
const contracts = [
  {
    packageName: 'token',
    wasmPath: `${buildDir}/token.wasm`,
    outputDir: 'packages/token-bindings',
    packageJsonName: '@punch-arena/token-bindings'
  },
  {
    packageName: 'governor',
    wasmPath: `${buildDir}/governor.wasm`,
    outputDir: 'packages/governor-bindings',
    packageJsonName: '@punch-arena/governor-bindings'
  },
  {
    packageName: 'treasury',
    wasmPath: `${buildDir}/treasury.wasm`,
    outputDir: 'packages/treasury-bindings',
    packageJsonName: '@punch-arena/treasury-bindings'
  }
];

function rewritePackageJsonName(outputDir, packageJsonName) {
  const packageJsonPath = `${outputDir}/package.json`;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = packageJsonName;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

run('cargo', ['build', '-p', 'token', '-p', 'governor', '-p', 'treasury', '--release', '--target', 'wasm32v1-none'], {
  env: {
    ...process.env,
    SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2: '0'
  }
});

for (const contract of contracts) {
  mkdirSync(contract.outputDir, { recursive: true });
  run('stellar', [
    'contract',
    'bindings',
    'typescript',
    '--wasm',
    contract.wasmPath,
    '--output-dir',
    contract.outputDir,
    '--overwrite'
  ]);
  rewritePackageJsonName(contract.outputDir, contract.packageJsonName);
}
