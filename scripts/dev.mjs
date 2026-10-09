import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] || 'both';
if (!['manage', 'payment', 'both'].includes(mode)) {
  console.error('Use node scripts/dev.mjs [manage|payment|both].');
  process.exit(1);
}

const webhookUrl = 'http://localhost:8787/v5/webhooks/stripe';
const stripeEvents = 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed';
const stripeCommand = process.platform === 'win32' ? 'stripe.cmd' : 'stripe';
const stripeArgs = ['listen', '--forward-to', webhookUrl, '--events', stripeEvents];
const devVarsPath = join(root, 'apps/api/.dev.vars');
const devVars = existsSync(devVarsPath) ? parseEnv(readFileSync(devVarsPath, 'utf8')) : {};
const stripeApiKey = process.env.STRIPE_API_KEY || devVars.STRIPE_SECRET_KEY;
const stripeEnv = stripeApiKey ? { ...process.env, STRIPE_API_KEY: stripeApiKey } : process.env;
const servers = [
  { name: 'API', cwd: join(root, 'apps/api'), cli: 'wrangler/wrangler-dist/cli.js', args: ['dev', '--port', '8787'] },
  { name: 'Manage', cwd: join(root, 'apps/manage'), cli: 'vite/bin/vite.js', args: ['--port', '5300'] },
  { name: 'Payment', cwd: join(root, 'apps/payment'), cli: 'vite/bin/vite.js', args: ['--port', '5400'] },
];
const children = new Set();
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.on('error', () => child.kill());
      setTimeout(() => child.kill(), 1000).unref();
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(process.exitCode), 3000).unref();
  if (children.size === 0) process.exit();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function getStripeSecret() {
  return new Promise((resolve, reject) => {
    const child = spawn(stripeCommand, [...stripeArgs, '--print-secret'], {
      cwd: root, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: stripeEnv,
    });
    children.add(child);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Stripe CLI timed out while fetching the local webhook secret.'));
    }, 20000);
    let output = '';
    let error = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { error += chunk; });
    child.on('error', cause => {
      clearTimeout(timeout);
      children.delete(child);
      reject(new Error(`Stripe CLI could not start: ${cause.message}`));
    });
    child.on('exit', code => {
      clearTimeout(timeout);
      children.delete(child);
      const secret = output.trim();
      if (code === 0 && /^whsec_[A-Za-z0-9]+$/.test(secret)) resolve(secret);
      else reject(new Error(`Stripe CLI could not provide a local webhook secret. Check the test API key, CLI access, and network connection. ${error.replace(/whsec_[A-Za-z0-9]+/g, '[hidden]').trim()}`));
    });
  });
}

function track(child, name) {
  children.add(child);
  child.on('error', error => {
    console.error(`${name} failed to start:`, error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} stopped (${signal ?? code ?? 'unknown'}).`);
      stop(code || 1);
    }
    if (stopping && children.size === 0) process.exit();
  });
}

function startServer(server) {
  const entry = join(server.cwd, 'node_modules', server.cli);
  if (!existsSync(entry)) throw new Error(`${server.name} dependency is missing. Run pnpm install first.`);
  const child = spawn(process.execPath, [entry, ...server.args], {
    cwd: server.cwd, stdio: 'inherit', windowsHide: true,
  });
  track(child, server.name);
}

function startStripeListener() {
  const child = spawn(stripeCommand, stripeArgs, {
    cwd: root, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: stripeEnv,
  });
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let pending = '';
    stream.setEncoding('utf8').on('data', chunk => {
      pending += chunk;
      const lines = pending.split(/(?<=\n)/);
      pending = lines.pop() || '';
      for (const line of lines) output.write(line.replace(/whsec_[A-Za-z0-9]+/g, '[hidden]'));
    }).on('end', () => {
      if (pending) output.write(pending.replace(/whsec_[A-Za-z0-9]+/g, '[hidden]'));
    });
  }
  track(child, 'Stripe listener');
}

try {
  if (stripeApiKey && !/^(sk|rk)_test_/.test(stripeApiKey)) throw new Error('Local Stripe listening requires a test API key in apps/api/.dev.vars or STRIPE_API_KEY.');
  const secret = await getStripeSecret();
  servers[0].args.push('--var', `STRIPE_WEBHOOK_SECRET:${secret}`);
  startServer(servers[0]);
  for (const server of servers.slice(1)) {
    if (mode === 'both' || mode.toLowerCase() === server.name.toLowerCase()) startServer(server);
  }
  startStripeListener();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
