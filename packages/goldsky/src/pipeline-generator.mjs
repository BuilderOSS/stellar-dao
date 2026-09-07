import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(moduleDir, '..');
export const repoRoot = resolve(packageRoot, '..', '..');
export const defaultTemplatePath = join(packageRoot, 'templates', 'dao-stellar-events.yaml.mustache');
export const defaultScriptPath = join(packageRoot, 'templates', 'activity-feed.script.js');
export const defaultOutputPath = join(packageRoot, 'pipelines', 'dao-stellar-events.yaml');
export const defaultEnvPaths = [join(packageRoot, '.env.local'), join(packageRoot, '.env')];

export function parseEnvFile(contents) {
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[match[1]] = value;
  }
  return result;
}

export function loadPackageEnv(env = process.env, envPaths = defaultEnvPaths) {
  const fileEnv = {};
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }
    Object.assign(fileEnv, parseEnvFile(readFileSync(envPath, 'utf8')));
  }

  return { ...fileEnv, ...env };
}

export function resolveDeploymentSelection(env = process.env) {
  const merged = loadPackageEnv(env);
  const network = merged.NEXT_PUBLIC_DAO_NETWORK || 'local';
  const label = merged.NEXT_PUBLIC_DAO_LABEL || 'local';
  const artifactPath = join(repoRoot, 'deploys', `${label}-${network}.json`);

  return { network, label, artifactPath };
}

export function loadDeploymentArtifact(selection = resolveDeploymentSelection()) {
  if (!existsSync(selection.artifactPath)) {
    throw new Error(`Deployment artifact not found: ${selection.artifactPath}`);
  }
  return JSON.parse(readFileSync(selection.artifactPath, 'utf8'));
}

export function indentBlock(text, spaces) {
  const indent = ' '.repeat(spaces);
  return text.trimEnd().split(/\r?\n/).map((line) => `${indent}${line}`).join('\n');
}

export function renderTemplate(template, variables) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return String(variables[key]);
  });
}

function formatContractRoleCases(contracts) {
  return Object.entries(contracts).map(([role, contractId]) => `          WHEN '${contractId}' THEN '${role}'`).join('\n');
}

function formatContractIdList(contracts) {
  const ids = Object.values(contracts);
  return ids
    .map((contractId, index) => `        '${contractId}'${index < ids.length - 1 ? ',' : ''}`)
    .join('\n');
}

export function buildGoldskyPipelineYaml({ deployment, templateSource, scriptSource }) {
  const template = templateSource ?? readFileSync(defaultTemplatePath, 'utf8');
  const script = scriptSource ?? readFileSync(defaultScriptPath, 'utf8');

  return renderTemplate(template, {
    PIPELINE_NAME: 'dao-stellar-events',
    RESOURCE_SIZE: 's',
    DESCRIPTION: `Index the ${deployment.network} DAO deployment with Goldsky Turbo`,
    DATASET_NAME: `stellar_${deployment.network}.events`,
    CONTRACT_ROLE_CASES: formatContractRoleCases(deployment.contracts),
    CONTRACT_ID_LIST: formatContractIdList(deployment.contracts),
    ACTIVITY_SCRIPT: indentBlock(script, 6)
  });
}

export function writeGoldskyPipeline({ env = process.env, outputPath = defaultOutputPath } = {}) {
  const selection = resolveDeploymentSelection(env);
  const deployment = loadDeploymentArtifact(selection);
  const yaml = buildGoldskyPipelineYaml({ deployment });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${yaml.trimEnd()}\n`);

  return { selection, deployment, outputPath, yaml };
}
