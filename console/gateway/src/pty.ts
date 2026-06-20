// Ponte entre um WebSocket e uma sessão pty (node-pty).
// kind="terminal" abre um shell; kind="claude" roda o Claude Code (CLI).
import { spawn, type IPty } from "node-pty";
import type { WebSocket } from "ws";

const SHELL_CMD = process.env.SHELL_CMD ?? "/bin/bash";
const CLAUDE_CMD = process.env.CLAUDE_CMD ?? "claude";

export function attachPty(
  ws: WebSocket,
  kind: "terminal" | "claude",
  label: string,
): void {
  const file = kind === "claude" ? CLAUDE_CMD : SHELL_CMD;
  const args = kind === "claude" ? [] : ["-l"];

  let term: IPty;
  try {
    term = spawn(file, args, {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME ?? "/home/user",
      env: { ...process.env, SETUPOS_USER: label },
    });
  } catch (e) {
    ws.send(`\r\n\x1b[31mfalha ao iniciar (${(e as Error).message})\x1b[0m\r\n`);
    ws.close();
    return;
  }

  term.onData((d) => ws.readyState === ws.OPEN && ws.send(d));
  term.onExit(() => ws.readyState === ws.OPEN && ws.close());

  ws.on("message", (raw) => {
    const msg = raw.toString();
    // Mensagens de controle (resize) chegam como JSON; o resto é input do usuário.
    if (msg.startsWith("{")) {
      try {
        const ev = JSON.parse(msg);
        if (ev.type === "resize" && ev.cols && ev.rows) {
          term.resize(ev.cols, ev.rows);
          return;
        }
      } catch {
        /* trata como input bruto */
      }
    }
    term.write(msg);
  });

  ws.on("close", () => term.kill());
}
