/**
 * Renders scripts/og-card.html to the social preview images.
 *
 *   node scripts/make-og.mjs
 *
 * Social scrapers want an opaque 1200x630 PNG. A raw app screenshot fails on
 * both counts: it carries an alpha channel, and it is mostly whitespace, so it
 * reads as blank at the size these cards are actually displayed.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9444;
const WIDTH = 1200;
const HEIGHT = 630;

const card = path.resolve("scripts/og-card.html");
const targets = ["app/opengraph-image.png", "app/twitter-image.png"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=2", // retina-sharp on high-DPI clients
    "--no-first-run",
    "--allow-file-access-from-files",
    "--user-data-dir=/tmp/sat-og-profile",
  ],
  { stdio: "ignore" },
);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await res.json()).find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((ok, no) => {
          ws.addEventListener("open", ok, { once: true });
          ws.addEventListener("error", no, { once: true });
        });
        let id = 0;
        const pending = new Map();
        ws.addEventListener("message", (e) => {
          const msg = JSON.parse(e.data);
          const r = pending.get(msg.id);
          if (!r) return;
          pending.delete(msg.id);
          if (msg.error) r.reject(new Error(msg.error.message));
          else r.resolve(msg.result);
        });
        return (method, params = {}) => {
          const n = ++id;
          ws.send(JSON.stringify({ id: n, method, params }));
          return new Promise((resolve, reject) => pending.set(n, { resolve, reject }));
        };
      }
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Could not connect to headless Chrome");
}

try {
  const send = await connect();
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send("Page.navigate", { url: `file://${card}` });
  await sleep(1200);

  // clip.scale stays 1: deviceScaleFactor already doubles it, giving a crisp
  // 2400x1260 (2x of the standard 1200x630). Opaque, so no scraper renders it
  // as a blank box.
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  });

  for (const target of targets) {
    writeFileSync(target, Buffer.from(data, "base64"));
    console.log(`  wrote ${target}`);
  }
} finally {
  chrome.kill();
}
