import { realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const apiDirectory = await realpath(path.resolve(scriptDirectory, '..'))
const localD1State = path.resolve(apiDirectory, '.wrangler', 'state', 'v3', 'd1')
const expectedLocalD1State = path.join(apiDirectory, '.wrangler', 'state', 'v3', 'd1')

if (localD1State !== expectedLocalD1State || !localD1State.startsWith(`${apiDirectory}${path.sep}`)) {
  throw new Error(`Refusing to reset unexpected D1 state path: ${localD1State}`)
}

try {
  const actualPath = await realpath(localD1State)
  if (actualPath !== localD1State) {
    throw new Error(`Refusing to reset D1 state outside the expected local path: ${actualPath}`)
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

console.log(`Removing local D1 state at ${localD1State}`)
await rm(localD1State, { recursive: true, force: true })

console.log('Reapplying local D1 migrations')
const wranglerCli = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const result = spawnSync(process.execPath, [wranglerCli, 'd1', 'migrations', 'apply', 'whitepoint-v5', '--local', '--env', 'production'], {
  cwd: apiDirectory,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
