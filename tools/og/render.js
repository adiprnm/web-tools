import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "zen-write.html");
const RAW = resolve(HERE, "og@2x.png");
const OUTPUT = resolve(HERE, "../../zen-write/og-image.png");

const CHROMIUM = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

if (!existsSync(CHROMIUM)) {
  console.error(`Chromium not found at ${CHROMIUM}. Set CHROMIUM_PATH.`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox"],
});

const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});

const page = await context.newPage();
await page.goto(`file://${SOURCE}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({
  path: RAW,
  clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
});
await browser.close();

const resizer = ["magick", "convert"].find((command) => {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

if (!resizer) {
  console.error("ImageMagick not found. The 2x render is left at tools/og/og@2x.png.");
  process.exit(1);
}

execFileSync(
  resizer,
  [RAW, "-resize", `${WIDTH}x${HEIGHT}`, "-strip", "-define", "png:compression-level=9", OUTPUT],
  { stdio: "inherit" },
);
rmSync(RAW);

console.log(`Wrote ${OUTPUT} (${WIDTH}x${HEIGHT}).`);
