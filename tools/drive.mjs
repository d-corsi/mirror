/**
 * Minimal Chrome DevTools Protocol driver, so the game's screens and flow can
 * be exercised and screenshotted without a browser extension.
 *
 * Usage:
 *   node tools/drive.mjs <script.json>
 *
 * The script is a list of steps:
 *   {"goto": "http://..."}          navigate and wait for load
 *   {"wait": 500}                   wait ms
 *   {"click": "#btnPlay"}           click an element by CSS selector
 *   {"key": "ArrowRight"}           press a key
 *   {"eval": "expression"}          evaluate JS, printing the result
 *   {"shot": "name.png"}            screenshot to the scratch dir
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const OUT = process.env.SHOT_DIR ?? ".";

const steps = JSON.parse(readFileSync(process.argv[2], "utf8"));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${process.env.WINDOW ?? "1280,720"}`,
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/mirror-cdp-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const cleanup = () => chrome.kill();
process.on("exit", cleanup);

// Wait for the debugger endpoint.
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    target = list.find((t) => t.type === "page");
  } catch {
    /* not up yet */
  }
}
if (!target) {
  console.error("could not reach Chrome debugging endpoint");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");

// Surface page console errors -- the whole point is catching silent failures.
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    console.log(`  [page error] ${d.exception?.description ?? d.text}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    console.log(`  [console.error] ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  }
});

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  }
  return r.result.value;
};

const clickSelector = async (selector) => {
  const box = await evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2, visible: r.width > 0 && r.height > 0 };
  })()`);
  if (!box) throw new Error(`selector not found: ${selector}`);
  if (!box.visible) throw new Error(`selector not visible: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
      buttons: type === "mousePressed" ? 1 : 0,
    });
  }
};

for (const step of steps) {
  if (step.goto) {
    await send("Page.navigate", { url: step.goto });
    await sleep(1200);
    console.log(`goto ${step.goto}`);
  } else if (step.wait) {
    await sleep(step.wait);
  } else if (step.click) {
    await clickSelector(step.click);
    console.log(`click ${step.click}`);
    await sleep(250);
  } else if (step.key) {
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key: step.key, code: step.key });
    }
  } else if (step.eval) {
    const v = await evaluate(step.eval);
    console.log(`eval ${step.eval} => ${JSON.stringify(v)}`);
  } else if (step.shot) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${step.shot}`, Buffer.from(data, "base64"));
    console.log(`shot ${step.shot}`);
  }
}

ws.close();
chrome.kill();
