import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run } from './lib.mjs';

const buildDir = 'target/wasm32v1-none/release';
const contracts = [
  {
    packageName: 'token',
    wasmPath: `${buildDir}/token.wasm`,
    outputDir: 'packages/token-bindings',
    packageJsonName: '@stellar-dao/token-bindings'
  },
  {
    packageName: 'governor',
    wasmPath: `${buildDir}/governor.wasm`,
    outputDir: 'packages/governor-bindings',
    packageJsonName: '@stellar-dao/governor-bindings'
  },
  {
    packageName: 'treasury',
    wasmPath: `${buildDir}/treasury.wasm`,
    outputDir: 'packages/treasury-bindings',
    packageJsonName: '@stellar-dao/treasury-bindings'
  },
  {
    packageName: 'auction',
    wasmPath: `${buildDir}/auction.wasm`,
    outputDir: 'packages/auction-bindings',
    packageJsonName: '@stellar-dao/auction-bindings'
  }
];

function rewritePackageJsonName(outputDir, packageJsonName) {
  const packageJsonPath = `${outputDir}/package.json`;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = packageJsonName;
  packageJson.dependencies['@stellar/stellar-sdk'] = '^16.1.0';
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function replaceNth(content, search, replacement, targetIndex) {
  let seen = 0;
  return content
    .split(search)
    .map((segment, index) => {
      if (index === 0) {
        return segment;
      }

      seen += 1;
      return `${seen === targetIndex ? replacement : search}${segment}`;
    })
    .join('');
}

function patchGeneratedBindings(packageName, outputDir) {
  const indexPath = `${outputDir}/src/index.ts`;
  let content = readFileSync(indexPath, 'utf8');

  if (packageName === 'token') {
    content = content.replace(
      'export * as rpc from "@stellar/stellar-sdk/rpc";\n\nif (typeof window !== "undefined") {',
      'export * as rpc from "@stellar/stellar-sdk/rpc";\n\ntype Point = Buffer;\n\nif (typeof window !== "undefined") {'
    );
    content = replaceNth(content, 'export const ComplianceError = {', 'export const ComplianceHookError = {', 2);
  }

  if (packageName === 'governor') {
    content = content.replace(
      'export class Client extends ContractClient {\n',
      'export class Client extends ContractClient {\n  declare txFromJSON: any;\n'
    );
  }

  if (packageName === 'treasury') {
    content = content.replace(
      '  execute: ({target, function, args}: {target: string, function: string, args: Array<any>}, options?: MethodOptions) => Promise<AssembledTransaction<any>>',
      '  execute: (params: {target: string, function_: string, args: Array<any>}, options?: MethodOptions) => Promise<AssembledTransaction<any>>'
    );
    content = content.replace(
      'export class Client extends ContractClient {\n',
      'export class Client extends ContractClient {\n  declare txFromJSON: any;\n'
    );
  }

  if (packageName === 'auction') {
    content = content.replace(
      'export class Client extends ContractClient {\n',
      'export class Client extends ContractClient {\n  declare txFromJSON: any;\n'
    );
  }

  content = content.replace(/this\.txFromJSON<[^>]+>/g, '(this as any).txFromJSON');
  content = content.replace(/\(this as any\)\.txFromJSON>/g, '(this as any).txFromJSON');

  writeFileSync(indexPath, content);
}

run('cargo', ['build', '-p', 'token', '-p', 'governor', '-p', 'treasury', '-p', 'auction', '--release', '--target', 'wasm32v1-none'], {
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
  patchGeneratedBindings(contract.packageName, contract.outputDir);
  rewritePackageJsonName(contract.outputDir, contract.packageJsonName);
}
