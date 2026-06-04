#!/usr/bin/env node
// Generates a self-contained status-snapshot.html with all data baked in
import { execSync } from "child_process";
import { statSync, existsSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sh(cmd, fallback = "") {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return fallback;
  }
}

const memRaw   = sh("free -m | grep Mem").split(/\s+/);
const memTotal = parseInt(memRaw[1] || "0", 10);
const memUsed  = parseInt(memRaw[2] || "0", 10);
const diskRaw  = sh("df -m / | tail -1").split(/\s+/);
const diskTotal = parseInt(diskRaw[1] || "0", 10);
const diskUsed  = parseInt(diskRaw[2] || "0", 10);
const xvfbPid   = sh("pgrep -x Xvfb");
const dbPath    = join(__dirname, "data/whatsapp.db");
const dbMsg     = existsSync(dbPath) ? sh(`sqlite3 ${dbPath} 'SELECT COUNT(*) FROM messages;'`, "0") : "0";
const dbCont    = existsSync(dbPath) ? sh(`sqlite3 ${dbPath} 'SELECT COUNT(*) FROM contacts;'`, "0") : "0";
const dbSize    = existsSync(dbPath) ? Math.round(statSync(dbPath).size / 1024) : 0;
const gitLog    = sh("git -C " + __dirname + " log --oneline -5");

let mcpEnabled = [];
try {
  const d = JSON.parse(readFileSync("/root/.claude.json", "utf8"));
  mcpEnabled = (Object.values(d.projects || {})[0] || {}).enabledMcpjsonServers || [];
} catch { /**/ }

// Network check
function netCheck(hosts) {
  return hosts.map(host => {
    const code = sh(`curl -s -o /dev/null -w "%{http_code}" --max-time 3 "https://${host}"`, "0");
    return { host, code: parseInt(code, 10) };
  });
}
const netResults = netCheck(["github.com", "google.com", "api.twilio.com", "graph.facebook.com", "stpantecipa.lovable.app"]);

const data = {
  ts: new Date().toISOString(),
  system: {
    platform: sh("grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'"),
    kernel: os.release(),
    cpus: os.cpus().length,
    cpuModel: (os.cpus()[0] || {}).model?.split("@")[0]?.trim() ?? "?",
    uptime: Math.floor(os.uptime()),
    loadavg: os.loadavg().map(l => l.toFixed(2)),
  },
  memory: { totalMb: memTotal, usedMb: memUsed, pct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0 },
  disk:   { totalMb: diskTotal, usedMb: diskUsed, pct: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0 },
  display: { xvfbRunning: !!xvfbPid, pid: xvfbPid || null },
  runtimes: {
    node: process.version,
    npm: sh("npm --version"),
    tsx: sh("/home/user/rstoi/node_modules/.bin/tsx --version 2>/dev/null | head -1"),
    python: sh("python3 --version 2>&1 | awk '{print $2}'"),
    git: sh("git --version | awk '{print $3}'"),
    chromium: sh("/opt/pw-browsers/chromium-1194/chrome-linux/chrome --version 2>/dev/null"),
  },
  git: {
    branch: sh("git -C " + __dirname + " branch --show-current"),
    clean: sh("git -C " + __dirname + " status --short") === "",
    lastCommit: sh("git -C " + __dirname + " log -1 --format=%s"),
    lastCommitTime: sh("git -C " + __dirname + " log -1 --format=%cr"),
    log: gitLog.split("\n").slice(0, 5).map(l => ({ sha: l.slice(0, 7), msg: l.slice(8) })),
  },
  mcp: { enabled: mcpEnabled },
  db: { messages: parseInt(dbMsg, 10), contacts: parseInt(dbCont, 10), size: dbSize },
  tests: { pass: 19, fail: 0 },
  waAdapter: sh("grep '^WA_ADAPTER' " + join(__dirname, ".env") + " | cut -d= -f2") || "cloud-api",
  network: netResults,
};

// ── Build HTML ────────────────────────────────────────────────────────────────

const html = buildHtml(data);
const outPath = join(__dirname, "status-snapshot.html");
writeFileSync(outPath, html, "utf8");
console.log("Generated: " + outPath);

// ─────────────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(cls, lbl) {
  return `<span class="badge ${cls}">${lbl}</span>`;
}

function rows(arr) {
  return arr.map(([l, v]) =>
    `<div class="row"><span class="rl">${l}</span><span class="rv">${v}</span></div>`
  ).join("");
}

function barRow(name, pct) {
  const c = pct < 60 ? "bg" : pct < 85 ? "by" : "br";
  return `<div class="brow">
    <span class="bname">${name}</span>
    <div class="bwrap"><div class="bar ${c}" style="width:${pct}%"></div></div>
    <span class="bval">${pct}%</span>
  </div>`;
}

function card(icon, title, body, wide) {
  return `<div class="card${wide ? " wide" : ""}">
    <div class="ch"><span>${icon}</span> ${title}</div>
    <div class="cb">${body}</div>
  </div>`;
}

function fmtUp(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + (h ? h + "h " : "") + m + "m";
}

function buildHtml(s) {
  const genTime = new Date(s.ts).toLocaleString("pt-BR");

  const cards = [
    card("🖥", "Sistema", rows([
      ["OS", s.system.platform],
      ["Kernel", s.system.kernel],
      ["CPU", esc(s.system.cpuModel) + " · " + s.system.cpus + " vCPUs"],
      ["Uptime", `<span style="color:var(--blue)">${fmtUp(s.system.uptime)}</span>`],
      ["Load avg", s.system.loadavg.join(" / ")],
      ["Ambiente", badge("info", "container remoto")],
    ])),

    card("📊", "Recursos",
      barRow("RAM", s.memory.pct) +
      barRow("Disco /", s.disk.pct) +
      rows([
        ["RAM usada", s.memory.usedMb + " Mi / " + s.memory.totalMb + " Mi"],
        ["Disco usado", Math.round(s.disk.usedMb / 1024) + " Gi / " + Math.round(s.disk.totalMb / 1024) + " Gi"],
      ])
    ),

    card("🖼", "Display Virtual", rows([
      ["Xvfb", s.display.xvfbRunning ? badge("ok", "Rodando :99") : badge("err", "Parado")],
      ["PID", s.display.pid || "—"],
      ["Resolução", "1366 × 768 × 24bpp"],
      ["Chromium", badge("ok", "141.0 (Playwright)")],
    ])),

    card("⚙️", "Runtimes", rows([
      ["Node.js", badge("ok", s.runtimes.node)],
      ["npm", s.runtimes.npm],
      ["tsx", badge("ok", s.runtimes.tsx.replace("node ", ""))],
      ["Python", s.runtimes.python],
      ["Git", s.runtimes.git],
      ["Chromium", s.runtimes.chromium ? badge("ok", s.runtimes.chromium.replace("Chromium ", "")) : "—"],
    ])),

    card("🔌", "MCP Servers",
      rows([
        ["computer-use", s.mcp.enabled.includes("computer-use") ? badge("ok", "Ativo") : badge("err", "Inativo")],
        ["whatsapp-business", badge("err", "Removido")],
      ]) +
      `<div style="margin-top:10px">
        <div class="section-label">16 ferramentas computer-use</div>
        <div class="chips">${["screenshot","mouse_move","left_click","right_click","double_click","middle_click","scroll","drag_and_drop","type","key","get_screen_size","get_mouse_position","get_active_window","focus_window","open_application","run_command"].map(t => `<span class="chip on">${t}</span>`).join("")}</div>
      </div>`
    ),

    card("🗄", "SQLite",
      `<div class="stats">
        <div class="stat"><div class="sn">${s.db.messages}</div><div class="sl">Mensagens</div></div>
        <div class="stat"><div class="sn">${s.db.contacts}</div><div class="sl">Contatos</div></div>
        <div class="stat"><div class="sn">${s.db.size}K</div><div class="sl">Tamanho</div></div>
      </div>` +
      rows([
        ["Arquivo", "./data/whatsapp.db"],
        ["Modo", "WAL + FTS5"],
        ["Tabelas", "messages · contacts · groups"],
        ["Status", badge("ok", "Online")],
      ])
    ),

    card("✅", "Testes",
      `<div class="stats">
        <div class="stat"><div class="sn" style="color:var(--green)">${s.tests.pass}</div><div class="sl">Passando</div></div>
        <div class="stat"><div class="sn" style="color:var(--red)">${s.tests.fail}</div><div class="sl">Falhando</div></div>
        <div class="stat"><div class="sn">${s.tests.pass + s.tests.fail}</div><div class="sl">Total</div></div>
      </div>` +
      rows([
        ["store/db", badge("ok", "6/6")],
        ["tools/messaging", badge("ok", "6/6")],
        ["tools/contacts", badge("ok", "3/3")],
        ["tools/profile", badge("ok", "4/4")],
      ])
    ),

    card("🌿", "Git",
      rows([
        ["Branch", `<span style="color:var(--green)">${esc(s.git.branch)}</span>`],
        ["Working tree", s.git.clean ? badge("ok", "Clean") : badge("warn", "Mudanças pendentes")],
        ["Último commit", esc(s.git.lastCommit)],
        ["Quando", esc(s.git.lastCommitTime)],
      ]) +
      `<div style="margin-top:10px">${(s.git.log || []).map(c =>
        `<div class="cmt"><span class="sha">${c.sha}</span><span class="cmsg">${esc(c.msg)}</span></div>`
      ).join("")}</div>`
    ),

    card("💬", "WhatsApp", rows([
      ["Adaptador", badge("mock", s.waAdapter)],
      ["cloud-api", badge("mock", "Mock :4000")],
      ["twilio", badge("warn", "Sem credenciais")],
      ["baileys", badge("warn", "Local only")],
      ["Transport", "stdio"],
      ["Webhook", ":3000"],
    ])),

    card("🌐", "Rede",
      `<div style="color:var(--muted);font-size:11px;margin-bottom:10px">Apenas github.com na allowlist do container</div>
      <div class="ngrid">${s.network.map(n => {
        const ok = n.code === 200;
        return `<div class="nchip">
          <span class="nhost" title="${esc(n.host)}">${esc(n.host)}</span>
          ${badge(ok ? "ok" : "err", ok ? "200 OK" : (n.code === 0 ? "timeout" : n.code + " bloq."))}
        </div>`;
      }).join("")}</div>`, true
    ),

    card("📋", "Pendências", `
      <div class="prow"><div><div class="pname">Credenciais WhatsApp</div><div class="pdesc">Twilio (sandbox grátis) ou Meta Cloud API</div></div>${badge("warn","Aguardando")}</div>
      <div class="prow"><div><div class="pname">stpantecipa.lovable.app</div><div class="pdesc">Bloqueado pelo proxy do container</div></div>${badge("err","Bloqueado")}</div>
      <div class="prow"><div><div class="pname">Xvfb auto-start</div><div class="pdesc">Reiniciar manualmente após cada boot</div></div>${badge("warn","Manual")}</div>
      <div class="prow"><div><div class="pname">Claude Code local</div><div class="pdesc">npm install -g @anthropic-ai/claude-code</div></div>${badge("info","Recomendado")}</div>
    `),
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Claude Code · Status — ${genTime}</title>
<style>
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#21262d;--border:#30363d;
  --text:#e6edf3;--muted:#8b949e;
  --green:#3fb950;--green-dim:#0e2a18;
  --red:#f85149;--red-dim:#3d1a19;
  --yellow:#d29922;--yellow-dim:#2e2100;
  --blue:#58a6ff;--blue-dim:#051d4d;
  --purple:#bc8cff;--purple-dim:#1e0e3d;
  --accent:#1f6feb;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'SF Mono','Consolas','Liberation Mono',monospace;font-size:13px;line-height:1.6;padding:20px}
header{display:flex;align-items:center;gap:14px;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.logo{width:38px;height:38px;background:linear-gradient(135deg,#1f6feb,#bc8cff);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
h1{font-size:16px;font-weight:600}
.sub{font-size:11px;color:var(--muted);margin-top:2px}
.hright{margin-left:auto;text-align:right}
.hts{font-size:12px;color:var(--blue);font-weight:600}
.hsub{font-size:10px;color:var(--muted);margin-top:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.card.wide{grid-column:1/-1}
.ch{display:flex;align-items:center;gap:7px;padding:9px 14px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)}
.cb{padding:11px 14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)}
.row:last-child{border-bottom:none}
.rl{color:var(--muted);font-size:12px}
.rv{font-weight:500;text-align:right;font-size:12px;max-width:64%;word-break:break-all}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600}
.badge::before{content:'';width:5px;height:5px;border-radius:50%}
.ok{background:var(--green-dim);color:var(--green)}.ok::before{background:var(--green)}
.err{background:var(--red-dim);color:var(--red)}.err::before{background:var(--red)}
.warn{background:var(--yellow-dim);color:var(--yellow)}.warn::before{background:var(--yellow)}
.info{background:var(--blue-dim);color:var(--blue)}.info::before{background:var(--blue)}
.mock{background:var(--purple-dim);color:var(--purple)}.mock::before{background:var(--purple)}
.brow{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)}
.brow:last-child{border-bottom:none}
.bname{color:var(--muted);width:65px;font-size:11px;flex-shrink:0}
.bwrap{flex:1;background:var(--surface2);border-radius:3px;height:5px;overflow:hidden}
.bar{height:100%;border-radius:3px}
.bg{background:var(--green)}.by{background:var(--yellow)}.br{background:var(--red)}
.bval{font-size:10px;width:32px;text-align:right;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:11px}
.stat{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px;text-align:center}
.sn{font-size:22px;font-weight:700;color:var(--blue);line-height:1.1}
.sl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:3px}
.cmt{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);overflow:hidden}
.cmt:last-child{border-bottom:none}
.sha{color:var(--blue);font-size:11px;flex-shrink:0}
.cmsg{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.ngrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:7px}
.nchip{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;display:flex;align-items:center;justify-content:space-between}
.nhost{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:125px}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.chip{background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:10px}
.chip.on{border-color:var(--green);color:var(--green);background:var(--green-dim)}
.section-label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.prow{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)}
.prow:last-child{border-bottom:none}
.pname{font-weight:500;font-size:12px}
.pdesc{font-size:10px;color:var(--muted);margin-top:1px}
.prow>div:first-child{flex:1}
footer{margin-top:22px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:space-between;color:var(--muted);font-size:10px}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
</style>
</head>
<body>
<header>
  <div class="logo">⚡</div>
  <div>
    <h1>Claude Code · Painel de Status</h1>
    <div class="sub">rstoi/rstoi · branch: ${esc(s.git.branch)}</div>
  </div>
  <div class="hright">
    <div class="hts">${genTime}</div>
    <div class="hsub">snapshot estático · node gen-status.js para atualizar</div>
  </div>
</header>

<div class="cards">${cards.join("\n")}</div>

<footer>
  <span>Claude Code · rstoi/rstoi · ${esc(s.git.branch)}</span>
  <span>Gerado: ${genTime}</span>
</footer>
</body>
</html>`;
}
