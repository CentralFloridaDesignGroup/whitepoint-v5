import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const apiDirectory = path.resolve(scriptDirectory, '..')
const action = process.argv[2]
const sqlFiles = {
  seed: 'invoice-overview-sample-seed.sql',
  clean: 'invoice-overview-sample-cleanup.sql',
}

if (!Object.hasOwn(sqlFiles, action) || process.argv.length !== 3) {
  console.error('Usage: pnpm --filter @whitepoint/api d1:sample-invoices [seed|clean]')
  process.exit(1)
}

const wranglerCli = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const sqlFile = path.join(scriptDirectory, 'sql', sqlFiles[action])
const result = spawnSync(process.execPath, [wranglerCli, 'd1', 'execute', 'whitepoint-v5', '--local', '--file', sqlFile], {
  cwd: apiDirectory,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
