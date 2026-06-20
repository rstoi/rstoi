"use client";
// Terminal web (xterm.js) ligado por WebSocket a uma sessão pty do gateway.
// `kind="terminal"` opera o host; `kind="claude"` roda o Claude Code (CLI).
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { openShellSocket } from "@/lib/gateway";

export default function TerminalPane({ kind }: { kind: "terminal" | "claude" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (disposed || !ref.current) return;

      const term = new Terminal({
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 13,
        cursorBlink: true,
        theme: { background: "#07111a", foreground: "#e7eef2" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(ref.current);
      fit.fit();

      const banner =
        kind === "claude"
          ? "setupOS · Claude CLI — conectando ao Claude Code…\r\n"
          : "setupOS · Terminal — conectando à sessão segura…\r\n";
      term.write(banner);

      let socket: WebSocket | null = null;
      try {
        socket = await openShellSocket(kind);
      } catch (e) {
        term.write(`\r\n\x1b[31m${(e as Error).message}\x1b[0m\r\n`);
        return;
      }

      socket.onmessage = (ev) => term.write(typeof ev.data === "string" ? ev.data : "");
      socket.onclose = () => term.write("\r\n\x1b[33m[sessão encerrada]\x1b[0m\r\n");
      const onData = term.onData((d) => socket?.readyState === 1 && socket.send(d));
      const onResize = () => {
        fit.fit();
        socket?.readyState === 1 &&
          socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        onData.dispose();
        socket?.close();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [kind]);

  return <div className="term" ref={ref} />;
}
