import { execSync, spawnSync, spawn } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const DISPLAY = process.env.DISPLAY ?? ":99";

function xdo(...args: string[]): string {
  const r = spawnSync("xdotool", args, { env: { ...process.env, DISPLAY } });
  if (r.error) throw new Error(`xdotool error: ${r.error.message}`);
  return r.stdout?.toString().trim() ?? "";
}

export function getScreenSize(): { width: number; height: number } {
  try {
    const out = execSync(`DISPLAY=${DISPLAY} xdpyinfo | grep dimensions`, { encoding: "utf8" });
    const m = out.match(/(\d+)x(\d+) pixels/);
    if (m) return { width: parseInt(m[1]!), height: parseInt(m[2]!) };
  } catch { /* fallback */ }
  return { width: 1280, height: 720 };
}

export function screenshot(): string {
  const file = join(tmpdir(), `screenshot-${Date.now()}.png`);
  try {
    spawnSync("scrot", ["-z", file], { env: { ...process.env, DISPLAY } });
    const data = readFileSync(file).toString("base64");
    unlinkSync(file);
    return data;
  } catch (e) {
    throw new Error(`Screenshot failed: ${String(e)}`);
  }
}

export function mouseMove(x: number, y: number): void {
  xdo("mousemove", "--sync", String(x), String(y));
}

export function leftClick(x: number, y: number): void {
  xdo("mousemove", "--sync", String(x), String(y));
  xdo("click", "1");
}

export function rightClick(x: number, y: number): void {
  xdo("mousemove", "--sync", String(x), String(y));
  xdo("click", "3");
}

export function doubleClick(x: number, y: number): void {
  xdo("mousemove", "--sync", String(x), String(y));
  xdo("click", "--repeat", "2", "--delay", "100", "1");
}

export function middleClick(x: number, y: number): void {
  xdo("mousemove", "--sync", String(x), String(y));
  xdo("click", "2");
}

export function typeText(text: string): void {
  xdo("type", "--clearmodifiers", "--delay", "50", "--", text);
}

export function pressKey(key: string): void {
  xdo("key", "--clearmodifiers", key);
}

export function scroll(x: number, y: number, direction: "up" | "down" | "left" | "right", clicks = 3): void {
  xdo("mousemove", "--sync", String(x), String(y));
  const btn = direction === "up" ? "4" : direction === "down" ? "5" : direction === "left" ? "6" : "7";
  xdo("click", "--repeat", String(clicks), btn);
}

export function dragAndDrop(startX: number, startY: number, endX: number, endY: number): void {
  xdo("mousemove", "--sync", String(startX), String(startY));
  xdo("mousedown", "1");
  xdo("mousemove", "--sync", String(endX), String(endY));
  xdo("mouseup", "1");
}

export function getMousePosition(): { x: number; y: number } {
  const out = xdo("getmouselocation", "--shell");
  const x = parseInt(out.match(/X=(\d+)/)?.[1] ?? "0");
  const y = parseInt(out.match(/Y=(\d+)/)?.[1] ?? "0");
  return { x, y };
}

export function getActiveWindow(): string {
  try {
    return xdo("getactivewindow");
  } catch {
    return "0";
  }
}

export function focusWindow(windowId: string): void {
  xdo("windowfocus", "--sync", windowId);
}

export function openApplication(app: string, args: string[] = []): void {
  const env = { ...process.env, DISPLAY };
  const child = spawn(app, args, { env, detached: true, stdio: "ignore" });
  child.unref();
}

export function runCommand(command: string): { stdout: string; stderr: string; exitCode: number } {
  const r = spawnSync("bash", ["-c", command], {
    env: { ...process.env, DISPLAY },
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    exitCode: r.status ?? 0,
  };
}
