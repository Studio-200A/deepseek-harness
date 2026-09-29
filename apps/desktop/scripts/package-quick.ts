/** Fast local AppImage rebuild from an already-prepared Linux target tree. */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import * as yaml from 'js-yaml'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { desktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, writeDesktopRuntime } from '../src/runtime-tree.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const TARGET = { platform: 'linux', arch: 'x64' } as const
/** Build outputs overlaid from a rebuilt checkout into the prepared dsh tree. */
const OVERLAY_OUTPUTS = ['lib', 'dist', 'presets'] as const

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  return new Promise((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop quick package: ${command} ${args.join(' ')} exited with ${String(code ?? signal)}`))
    })
  })
}

/** Resolve a workspace dependency's file relative to the desktop package, avoiding package export maps. */
function resolveDependency(relativePath: string): string {
  const local = join(APP_ROOT, 'node_modules', ...relativePath.split('/'))
  if (existsSync(local)) return local
  const repository = join(REPOSITORY_ROOT, 'node_modules', ...relativePath.split('/'))
  if (existsSync(repository)) return repository
  throw new Error(`desktop quick package: dependency file ${relativePath} is not installed`)
}

/** Resolve every workspace package directory by name from the workspace manifest. */
function workspacePackageDirectories(): Map<string, string> {
  const workspace = yaml.load(readFileSync(join(REPOSITORY_ROOT, 'pnpm-workspace.yaml'), 'utf8')) as { packages: string[] }
  const directories = new Map<string, string>()
  for (const manifestPath of workspace.packages.flatMap(pattern =>
    globSync(`${pattern}/package.json`, { cwd: REPOSITORY_ROOT }))) {
    const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, manifestPath), 'utf8')) as { name?: unknown }
    if (typeof manifest.name === 'string' && manifest.name !== '') directories.set(manifest.name, dirname(manifestPath))
  }
  return directories
}

/**
 * Copy each rebuilt workspace package output over its installed copy in the prepared tree.
 * @param dsh - Prepared dsh runtime directory from a complete packaging run.
 * @returns Number of overlaid output directories.
 */
function overlayRebuiltPackages(dsh: string): number {
  let overlaid = 0
  for (const [name, relativeDirectory] of workspacePackageDirectories()) {
    const destination = join(dsh, 'node_modules', name)
    if (!existsSync(destination)) continue
    for (const output of OVERLAY_OUTPUTS) {
      const source = join(REPOSITORY_ROOT, relativeDirectory, output)
      if (!existsSync(source)) continue
      const target = join(destination, output)
      cpSync(source, target, { recursive: true, dereference: true, force: true })
      overlaid += 1
    }
  }
  return overlaid
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { smoke: { type: 'boolean', default: false } } })
  const buildPaths = desktopTargetBuildPaths('linux-x64')
  const environment = loadDesktopPackageEnvironment('linux')
  for (const required of [buildPaths.dsh, buildPaths.runtime, buildPaths.electron, buildPaths.packageSet]) {
    if (!existsSync(required)) {
      throw new Error(`desktop quick package: ${required} is missing; run package:linux:x64 once to prepare the target`)
    }
  }
  const pnpm = resolveDependency('pnpm/bin/pnpm.cjs')
  const builder = resolveDependency('electron-builder/cli.js')
  await run(process.execPath, [pnpm, 'run', 'build:official'], REPOSITORY_ROOT, process.env)
  const overlaid = overlayRebuiltPackages(buildPaths.dsh)
  // Overlays changed the tree: rewrite the descriptor so packaging verification stays exact.
  const descriptor = readDesktopRuntime(buildPaths.dsh)
  writeDesktopRuntime(buildPaths.dsh, descriptor.release, descriptor.sharedPackages.map(entry => entry.name), TARGET)
  const buildEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    DSH_DESKTOP_TARGET_PLATFORM: TARGET.platform,
    DSH_DESKTOP_TARGET_ARCH: TARGET.arch,
  }
  await run(process.execPath, [builder, '--config', 'electron-builder.config.mjs', '--linux', '--x64', '--publish', 'never'], APP_ROOT, buildEnvironment)
  if (values.smoke) await run(process.execPath, [pnpm, 'exec', 'tsx', 'scripts/smoke-packaged-runtime.ts'], APP_ROOT, buildEnvironment)
  process.stdout.write(`desktop quick package: overlaid ${overlaid} rebuilt outputs into ${buildPaths.dsh}; artifact at ${join(buildPaths.artifacts, 'deepseek-harness')}${'\n'}`)
}

await main()
