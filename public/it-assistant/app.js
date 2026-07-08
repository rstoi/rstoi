const $ = (sel) => document.querySelector(sel);
let selectedDeviceId = null;
let devicesCache = [];

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("não autenticado");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Falha em ${path}`);
  }
  return res.status === 204 ? null : res.json();
}

function relTime(iso) {
  if (!iso) return "nunca reportou";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

function fmt(v, unit, digits = 0) {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(digits)} ${unit}`;
}

function badge(status) {
  const label = { ok: "OK", warning: "Atenção", critical: "Crítico", unknown: "Sem dados" }[status] || "Sem dados";
  return `<span class="badge ${status || "unknown"}">${label}</span>`;
}

// ── usuário / logout ─────────────────────────────────────────────────────────

async function loadMe() {
  try {
    const { user } = await api("/api/me");
    $("#user").innerHTML = `
      ${user.picture ? `<img src="${user.picture}" alt=""/>` : ""}
      <span>${user.name}${user.role === "admin" ? " · admin" : ""}</span>`;
  } catch {
    /* redirecionamento já tratado em api() */
  }
}

$("#logoutBtn").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  location.href = "/login";
});

// ── grid de dispositivos ─────────────────────────────────────────────────────

function deviceStatus(d) {
  return d.status || "unknown";
}

function renderBanner(devices) {
  const critical = devices.filter((d) => deviceStatus(d) === "critical").length;
  const warning = devices.filter((d) => deviceStatus(d) === "warning").length;
  const el = $("#banner");
  if (critical > 0) {
    el.innerHTML = `<div class="banner critical">⚠️ ${critical} dispositivo(s) em estado crítico para videoconferência agora.</div>`;
  } else if (warning > 0) {
    el.innerHTML = `<div class="banner warning">⚠️ ${warning} dispositivo(s) com qualidade de rede degradada.</div>`;
  } else {
    el.innerHTML = "";
  }
}

function renderGrid(devices) {
  const grid = $("#deviceGrid");
  if (!devices.length) {
    grid.innerHTML = `<div class="empty">Nenhum dispositivo cadastrado ainda. Clique em "+ Adicionar dispositivo" para começar a monitorar sua rede doméstica.</div>`;
    return;
  }
  grid.innerHTML = devices
    .map(
      (d) => `
      <div class="card" data-id="${d.id}">
        <div class="ch">
          ${badge(deviceStatus(d))}
          <div>
            <div class="name">${escapeHtml(d.name)}</div>
            <div class="loc">${escapeHtml(d.location || d.owner_name || "")}</div>
          </div>
        </div>
        <div class="cb">
          <div class="row"><span class="rl">Latência</span><span class="rv">${fmt(d.latency_ms, "ms")}</span></div>
          <div class="row"><span class="rl">Jitter</span><span class="rv">${fmt(d.jitter_ms, "ms")}</span></div>
          <div class="row"><span class="rl">Perda de pacotes</span><span class="rv">${fmt(d.packet_loss_pct, "%", 1)}</span></div>
          <div class="row"><span class="rl">Download / Upload</span><span class="rv">${fmt(d.download_mbps, "Mbps", 1)} / ${fmt(d.upload_mbps, "Mbps", 1)}</span></div>
          <div class="seen">Responsável: ${escapeHtml(d.owner_name || "—")} · última atualização ${relTime(d.ts || d.last_seen_at)}</div>
        </div>
      </div>`,
    )
    .join("");

  grid.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => selectDevice(card.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadStatus() {
  const { devices } = await api("/api/status");
  devicesCache = devices;
  renderBanner(devices);
  renderGrid(devices);
  if (selectedDeviceId) renderDetail(selectedDeviceId);
}

// ── alertas ──────────────────────────────────────────────────────────────────

async function loadAlerts() {
  const { alerts } = await api("/api/alerts?open=true");
  const el = $("#alerts");
  if (!alerts.length) {
    el.innerHTML = `<div class="empty">Nenhum alerta ativo — tudo dentro dos limiares para videoconferência.</div>`;
    return;
  }
  el.innerHTML = alerts
    .map(
      (a) => `
      <div class="alert-item ${a.severity}">
        <div class="dot"></div>
        <div>
          <div>${escapeHtml(a.device_name)} — ${escapeHtml(a.message)}</div>
          <div class="meta">${escapeHtml(a.owner_name)} · ${relTime(a.ts)}</div>
        </div>
      </div>`,
    )
    .join("");
}

// ── detalhe / histórico ──────────────────────────────────────────────────────

function drawChart(canvas, series, colors) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const allVals = series.flatMap((s) => s.data.filter((v) => v !== null && v !== undefined));
  if (!allVals.length) {
    ctx.fillStyle = "#8b949e";
    ctx.font = "12px sans-serif";
    ctx.fillText("Sem dados no período", 10, h / 2);
    return;
  }
  const max = Math.max(...allVals, 1);
  const min = 0;
  const n = Math.max(...series.map((s) => s.data.length), 2);

  series.forEach((s, i) => {
    ctx.beginPath();
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 1.6;
    s.data.forEach((v, idx) => {
      if (v === null || v === undefined) return;
      const x = (idx / (n - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

async function selectDevice(id) {
  selectedDeviceId = id;
  await renderDetail(id);
}

async function renderDetail(id) {
  const device = devicesCache.find((d) => d.id === id);
  if (!device) return;
  const { history } = await api(`/api/devices/${id}/history?hours=24`);

  const wrap = $("#detailWrap");
  wrap.innerHTML = `
    <div class="detail">
      <div class="section-head">
        <h3>${escapeHtml(device.name)} — últimas 24h</h3>
        <button class="btn" id="rotateTokenBtn">Gerar novo token</button>
        <button class="btn danger" id="deleteDeviceBtn">Remover</button>
      </div>
      <canvas class="chart" id="latencyChart"></canvas>
      <div class="metric-legend">
        <span><i style="background:#58a6ff"></i>Latência (ms)</span>
        <span><i style="background:#bc8cff"></i>Jitter (ms)</span>
        <span><i style="background:#f85149"></i>Perda de pacotes (%)</span>
      </div>
      <canvas class="chart" id="bwChart" style="margin-top:18px"></canvas>
      <div class="metric-legend">
        <span><i style="background:#3fb950"></i>Download (Mbps)</span>
        <span><i style="background:#d29922"></i>Upload (Mbps)</span>
      </div>
    </div>`;

  drawChart(
    $("#latencyChart"),
    [
      { data: history.map((r) => r.latency_ms) },
      { data: history.map((r) => r.jitter_ms) },
      { data: history.map((r) => r.packet_loss_pct) },
    ],
    ["#58a6ff", "#bc8cff", "#f85149"],
  );
  drawChart(
    $("#bwChart"),
    [{ data: history.map((r) => r.download_mbps) }, { data: history.map((r) => r.upload_mbps) }],
    ["#3fb950", "#d29922"],
  );

  $("#rotateTokenBtn").addEventListener("click", async () => {
    const { token } = await api(`/api/devices/${id}/rotate-token`, { method: "POST" });
    alert(`Novo token gerado (copie agora, não será mostrado novamente):\n\n${token}`);
  });
  $("#deleteDeviceBtn").addEventListener("click", async () => {
    if (!confirm(`Remover "${device.name}" e todo o histórico?`)) return;
    await api(`/api/devices/${id}`, { method: "DELETE" });
    selectedDeviceId = null;
    $("#detailWrap").innerHTML = "";
    loadStatus();
  });
}

// ── adicionar dispositivo ────────────────────────────────────────────────────

$("#addDeviceBtn").addEventListener("click", () => {
  $("#addOverlay").classList.remove("hidden");
  $("#addForm").classList.remove("hidden");
  $("#addResult").classList.add("hidden");
  $("#devName").value = "";
  $("#devLocation").value = "";
});
$("#cancelAdd").addEventListener("click", () => $("#addOverlay").classList.add("hidden"));
$("#addOverlay").addEventListener("click", (e) => {
  if (e.target.id === "addOverlay") $("#addOverlay").classList.add("hidden");
});

$("#confirmAdd").addEventListener("click", async () => {
  const name = $("#devName").value.trim();
  const location = $("#devLocation").value.trim();
  if (!name) return;
  const device = await api("/api/devices", {
    method: "POST",
    body: JSON.stringify({ name, location }),
  });
  $("#addForm").classList.add("hidden");
  const resultBox = $("#addResult");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <p style="font-size:12.5px">Dispositivo <strong>${escapeHtml(device.name)}</strong> criado. Copie o token do agente agora — ele não será mostrado novamente:</p>
    <div class="token-box">${device.token}<div class="warn">Guarde em local seguro. Use para configurar o agente de monitoramento neste computador.</div></div>
    <div class="snippet">${escapeHtml(`IT_ASSISTANT_SERVER_URL=${window.location.origin}\nIT_ASSISTANT_DEVICE_TOKEN=${device.token}`)}</div>
    <div class="actions"><button class="btn primary" id="closeAdd">Concluído</button></div>`;
  $("#closeAdd").addEventListener("click", () => {
    $("#addOverlay").classList.add("hidden");
    loadStatus();
  });
});

// ── boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  await loadMe();
  await Promise.all([loadStatus(), loadAlerts()]);
  setInterval(() => {
    loadStatus().catch(() => {});
    loadAlerts().catch(() => {});
  }, 30000);
}
boot();
