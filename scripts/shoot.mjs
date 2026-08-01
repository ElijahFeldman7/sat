/**
 * Screenshots the signed-in app at the Bluebook reference viewport (1470x890)
 * by driving headless Chrome over CDP. Used for the pixel-comparison pass.
 *
 *   node scripts/shoot.mjs <out-dir> <cookie> <name=path> [name=path ...]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const WIDTH = 1470;
const HEIGHT = 890;

const [outDir, cookie, ...targets] = process.argv.slice(2);
if (!outDir || !cookie || !targets.length) {
  console.error("usage: node scripts/shoot.mjs <out-dir> <cookie> <name=path> ...");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--user-data-dir=/tmp/sat-shoot-profile",
  ],
  { stdio: "ignore" },
);

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      const resolver = this.pending.get(msg.id);
      if (resolver) {
        this.pending.delete(msg.id);
        if (msg.error) resolver.reject(new Error(msg.error.message));
        else resolver.resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve, { once: true });
          ws.addEventListener("error", reject, { once: true });
        });
        return new CDP(ws);
      }
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Could not connect to headless Chrome");
}

const [cookieName, ...rest] = cookie.split("=");
const cookieValue = rest.join("=");

try {
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Network.setCookie", {
    name: cookieName,
    value: cookieValue,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  for (const target of targets) {
    const eq = target.indexOf("=");
    const name = target.slice(0, eq);
    const urlPath = target.slice(eq + 1);

    // "path::js" runs the snippet after load, to capture popovers and sub-views.
    const [route, script] = urlPath.split("::");
    await cdp.send("Page.navigate", { url: `http://localhost:3000${route}` });
    await sleep(2600);
    if (script) {
      await cdp.send("Runtime.evaluate", { expression: script, awaitPromise: true });
      await sleep(700);
    }

    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  wrote ${file}`);
  }
} finally {
  chrome.kill();
}
