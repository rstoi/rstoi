#!/usr/bin/env tsx
/**
 * Computer Use MCP Server
 *
 * Exposes tools for Claude to control the computer:
 * screenshot, mouse, keyboard, window management, shell commands.
 *
 * Requires: xdotool, scrot, Xvfb (Linux)
 * Virtual display: DISPLAY=:99 (started by npm run computer-use)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  screenshot,
  mouseMove,
  leftClick,
  rightClick,
  doubleClick,
  middleClick,
  typeText,
  pressKey,
  scroll,
  dragAndDrop,
  getMousePosition,
  getScreenSize,
  getActiveWindow,
  focusWindow,
  openApplication,
  runCommand,
} from "./tools.js";

const server = new McpServer({
  name: "computer-use",
  version: "1.0.0",
});

// ── Screenshot ───────────────────────────────────────────────────────────────
server.tool(
  "screenshot",
  "Take a screenshot of the current screen. Returns a base64-encoded PNG image.",
  {},
  async () => {
    try {
      const base64 = screenshot();
      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: `Screenshot captured (${base64.length} bytes base64)`,
          },
        ],
      };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

// ── Screen info ──────────────────────────────────────────────────────────────
server.tool(
  "get_screen_size",
  "Get the current screen resolution (width and height in pixels).",
  {},
  async () => {
    const size = getScreenSize();
    return { content: [{ type: "text" as const, text: JSON.stringify(size) }] };
  },
);

// ── Mouse tools ──────────────────────────────────────────────────────────────
server.tool(
  "mouse_move",
  "Move the mouse cursor to the specified (x, y) screen coordinates.",
  { x: z.number().int().describe("X coordinate"), y: z.number().int().describe("Y coordinate") },
  async ({ x, y }) => {
    try {
      mouseMove(x, y);
      return { content: [{ type: "text" as const, text: `Mouse moved to (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "left_click",
  "Left-click at the specified (x, y) coordinates.",
  { x: z.number().int(), y: z.number().int() },
  async ({ x, y }) => {
    try {
      leftClick(x, y);
      return { content: [{ type: "text" as const, text: `Left-clicked at (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "right_click",
  "Right-click at the specified (x, y) coordinates.",
  { x: z.number().int(), y: z.number().int() },
  async ({ x, y }) => {
    try {
      rightClick(x, y);
      return { content: [{ type: "text" as const, text: `Right-clicked at (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "double_click",
  "Double-click at the specified (x, y) coordinates.",
  { x: z.number().int(), y: z.number().int() },
  async ({ x, y }) => {
    try {
      doubleClick(x, y);
      return { content: [{ type: "text" as const, text: `Double-clicked at (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "middle_click",
  "Middle-click at the specified (x, y) coordinates.",
  { x: z.number().int(), y: z.number().int() },
  async ({ x, y }) => {
    try {
      middleClick(x, y);
      return { content: [{ type: "text" as const, text: `Middle-clicked at (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "scroll",
  "Scroll the mouse wheel at the specified coordinates.",
  {
    x: z.number().int(),
    y: z.number().int(),
    direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
    clicks: z.number().int().min(1).max(20).default(3).describe("Number of scroll clicks"),
  },
  async ({ x, y, direction, clicks }) => {
    try {
      scroll(x, y, direction, clicks);
      return { content: [{ type: "text" as const, text: `Scrolled ${direction} ${clicks} clicks at (${x}, ${y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "drag_and_drop",
  "Click and drag from one position to another.",
  {
    start_x: z.number().int(),
    start_y: z.number().int(),
    end_x: z.number().int(),
    end_y: z.number().int(),
  },
  async ({ start_x, start_y, end_x, end_y }) => {
    try {
      dragAndDrop(start_x, start_y, end_x, end_y);
      return { content: [{ type: "text" as const, text: `Dragged from (${start_x}, ${start_y}) to (${end_x}, ${end_y})` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "get_mouse_position",
  "Get the current mouse cursor position.",
  {},
  async () => {
    try {
      const pos = getMousePosition();
      return { content: [{ type: "text" as const, text: JSON.stringify(pos) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

// ── Keyboard tools ───────────────────────────────────────────────────────────
server.tool(
  "type",
  "Type text using the keyboard. The text is typed at the current focus position.",
  { text: z.string().describe("Text to type") },
  async ({ text }) => {
    try {
      typeText(text);
      return { content: [{ type: "text" as const, text: `Typed: ${text.slice(0, 50)}${text.length > 50 ? "…" : ""}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "key",
  "Press a keyboard key or combination. Uses xdotool key syntax (e.g. 'Return', 'ctrl+c', 'alt+Tab', 'super').",
  { key: z.string().describe("Key name or combination (xdotool syntax)") },
  async ({ key }) => {
    try {
      pressKey(key);
      return { content: [{ type: "text" as const, text: `Pressed key: ${key}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

// ── Window tools ─────────────────────────────────────────────────────────────
server.tool(
  "get_active_window",
  "Get the window ID of the currently focused window.",
  {},
  async () => {
    try {
      const id = getActiveWindow();
      return { content: [{ type: "text" as const, text: id }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "focus_window",
  "Bring a window to focus by its window ID.",
  { window_id: z.string().describe("Window ID (from get_active_window)") },
  async ({ window_id }) => {
    try {
      focusWindow(window_id);
      return { content: [{ type: "text" as const, text: `Focused window ${window_id}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

server.tool(
  "open_application",
  "Launch an application on the desktop.",
  {
    app: z.string().describe("Application executable name or path"),
    args: z.array(z.string()).optional().describe("Command-line arguments"),
  },
  async ({ app, args }) => {
    try {
      openApplication(app, args ?? []);
      return { content: [{ type: "text" as const, text: `Launched: ${app} ${(args ?? []).join(" ")}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

// ── Shell execution ──────────────────────────────────────────────────────────
server.tool(
  "run_command",
  "Execute a shell command and return its output. Commands run with DISPLAY set so GUI apps can launch.",
  { command: z.string().describe("Shell command to run (bash -c)") },
  async ({ command }) => {
    try {
      const { stdout, stderr, exitCode } = runCommand(command);
      const text = [
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
        `exit_code: ${exitCode}`,
      ].filter(Boolean).join("\n");
      return { content: [{ type: "text" as const, text: text.trim() }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] };
    }
  },
);

// ── Start ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Computer Use MCP] Server ready — DISPLAY=" + (process.env.DISPLAY ?? ":99"));
}

main().catch((e) => {
  console.error("[Computer Use MCP] Fatal:", e);
  process.exit(1);
});
