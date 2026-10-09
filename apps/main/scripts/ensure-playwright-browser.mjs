import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const executablePath = chromium.executablePath();

if (existsSync(executablePath)) {
  console.log(`Playwright Chromium is already installed at ${executablePath}`);
  process.exit(0);
}

const playwrightCli = require.resolve("playwright/cli");
const result = spawnSync(process.execPath, [playwrightCli, "install", "chromium"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
