#!/usr/bin/env python3
"""Gera o documento executivo da infraestrutura em Google Cloud (sem Vertex AI)
em PDF (texto vetorial) com a marca setup.com.br. Reaproveita os primitivos de
layout do build_pdf.py. Não depende de LibreOffice — usa o backend PDF do
matplotlib."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, FancyBboxPatch
import matplotlib.image as mpimg

A = "/home/user/rstoi/docs/assets"
OUT = "/home/user/rstoi/docs/Infraestrutura-Google-Cloud-setup.com.br.pdf"

# Paleta da marca
INK   = "#003C54"; BLUE = "#0E6E92"; TEAL = "#1F97B4"; STEEL = "#609CC0"
SLATE = "#5E6A72"; BODY = "#212B36"; GRAY = "#A8A8A8"
LIGHT = "#E4EEF4"; LIGHT2 = "#E1F0F4"; STEELT = "#EAF1F8"; GREY = "#F1F4F6"
WHITE = "#FFFFFF"

plt.rcParams["font.family"] = "DejaVu Sans"

PW, PH = 8.5, 11.0          # Letter
ML, MR, MT, MB = 0.9, 0.9, 0.95, 0.9
CW = PW - ML - MR

_mfig = plt.figure(figsize=(PW, PH), dpi=200)
_mr = _mfig.canvas.get_renderer()
def tw(s, fs, weight="normal"):
    t = _mfig.text(0, 0, s, fontsize=fs, fontweight=weight, parse_math=False)
    w = t.get_window_extent(_mr).width / 200.0
    t.remove()
    return w

def wrap(s, fs, weight, maxw):
    out, cur = [], ""
    for word in s.split():
        t = (cur + " " + word).strip()
        if tw(t, fs, weight) <= maxw or not cur:
            cur = t
        else:
            out.append(cur); cur = word
    if cur: out.append(cur)
    return out or [""]

pdf = PdfPages(OUT)
fig = None; y = 0.0; pageno = 0

def xf(x_in): return x_in / PW
def yf(y_in): return 1 - y_in / PH

def new_page(cover=False):
    global fig, y, pageno
    if fig is not None:
        _footer(); pdf.savefig(fig); plt.close(fig)
    fig = plt.figure(figsize=(PW, PH), dpi=200)
    pageno += 1
    y = MT

def _footer():
    try:
        logo = mpimg.imread(f"{A}/setup_logo@hi.png")
        ar = logo.shape[1] / logo.shape[0]
        h = 0.16; w = h * ar
        axl = fig.add_axes([xf(ML), yf(PH - MB + 0.42), w / PW, h / PH])
        axl.imshow(logo); axl.axis("off")
    except Exception:
        pass
    fig.text(xf(ML + 1.2), yf(PH - MB + 0.5),
             "·  Infraestrutura em Google Cloud  ·  Documento Executivo",
             fontsize=7.5, color=SLATE, va="center")
    fig.text(xf(PW - MR), yf(PH - MB + 0.5), str(pageno),
             fontsize=7.5, color=SLATE, ha="right", va="center", fontweight="bold")

def ensure(h_in):
    global y
    if y + h_in > PH - MB:
        new_page()

def rect(x_in, y_top_in, w_in, h_in, color, ec="none", lw=0, rounded=False):
    if rounded:
        p = FancyBboxPatch((xf(x_in), yf(y_top_in + h_in)),
                           w_in / PW, h_in / PH,
                           boxstyle="round,pad=0,rounding_size=0.004",
                           fc=color, ec=ec, lw=lw, transform=fig.transFigure,
                           clip_on=False)
    else:
        p = Rectangle((xf(x_in), yf(y_top_in + h_in)), w_in / PW, h_in / PH,
                      fc=color, ec=ec, lw=lw, transform=fig.transFigure,
                      clip_on=False)
    fig.add_artist(p)

def put(x_in, y_base_in, s, fs, color=BODY, weight="normal", style="normal", ha="left"):
    fig.text(xf(x_in), yf(y_base_in), s, fontsize=fs, color=color,
             fontweight=weight, fontstyle=style, ha=ha, va="baseline",
             parse_math=False)

def gap(h):
    global y; y += h

def heading(num, title):
    global y
    ensure(0.5)
    y += 0.10
    base = y + 0.16
    if num:
        put(ML, base, f"{num}  ", 15, TEAL, "bold")
        put(ML + tw(f"{num}  ", 15, "bold"), base, title, 15, INK, "bold")
    else:
        put(ML, base, title, 15, INK, "bold")
    y = base + 0.06
    rect(ML, y, CW, 0.012, "#D2E2EC")
    y += 0.12

def subheading(s):
    global y
    ensure(0.35)
    y += 0.06
    put(ML, y + 0.14, s, 12, BLUE, "bold")
    y += 0.24

def paragraph(s, italic=False, color=BODY, fs=10.5, x=ML, w=CW):
    global y
    style = "italic" if italic else "normal"
    for line in wrap(s, fs, "normal", w):
        ensure(fs / 72 * 1.35)
        put(x, y + fs / 72, line, fs, color, style=style)
        y += fs / 72 * 1.32
    y += 0.05

def bullet(prefix, s, fs=10.5):
    global y
    indent = 0.24
    first = True
    full = (prefix or "") + s
    lines = wrap(full, fs, "normal", CW - indent)
    for i, line in enumerate(lines):
        ensure(fs / 72 * 1.35)
        if first:
            put(ML + 0.04, y + fs / 72, "•", fs, BLUE, "bold")
            if prefix and line.startswith(prefix):
                put(ML + indent, y + fs / 72, prefix, fs, INK, "bold")
                put(ML + indent + tw(prefix, fs, "bold"), y + fs / 72,
                    line[len(prefix):], fs, BODY)
            else:
                put(ML + indent, y + fs / 72, line, fs, BODY)
            first = False
        else:
            put(ML + indent, y + fs / 72, line, fs, BODY)
        y += fs / 72 * 1.3
    y += 0.03

def image(path, width_in, caption=None):
    global y
    img = mpimg.imread(path)
    ar = img.shape[1] / img.shape[0]
    w = min(width_in, CW); h = w / ar
    ensure(h + (0.22 if caption else 0.08))
    x = ML + (CW - w) / 2
    ax = fig.add_axes([xf(x), yf(y + h), w / PW, h / PH])
    ax.imshow(img); ax.axis("off")
    y += h + 0.04
    if caption:
        put(PW / 2, y + 0.10, caption, 8, SLATE, style="italic", ha="center")
        y += 0.20

def callout(label, text, bg=LIGHT2, fs=10.5):
    global y
    inner = CW - 0.5
    lines = wrap(label + text, fs, "normal", inner)
    h = 0.18 + len(lines) * (fs / 72 * 1.3) + 0.12
    ensure(h + 0.1)
    rect(ML, y, CW, h, bg, rounded=True)
    yy = y + 0.20
    for i, line in enumerate(lines):
        if i == 0 and line.startswith(label):
            put(ML + 0.25, yy, label, fs, INK, "bold")
            put(ML + 0.25 + tw(label, fs, "bold"), yy, line[len(label):], fs, BODY)
        else:
            put(ML + 0.25, yy, line, fs, BODY)
        yy += fs / 72 * 1.3
    y += h + 0.12

def table(headers, rows, widths, fs=9.5):
    global y
    cw = [w * CW for w in widths]
    pad = 0.09
    def row_h(cells):
        mx = 1
        for c, w in zip(cells, cw):
            mx = max(mx, len(wrap(c, fs, "normal", w - 2 * pad)))
        return 0.1 + mx * (fs / 72 * 1.25) + 0.08
    hh = row_h(headers)
    ensure(hh + 0.2)
    x = ML
    rect(ML, y, CW, hh, INK)
    for c, w in zip(headers, cw):
        put(x + pad, y + 0.20, c, fs, WHITE, "bold")
        x += w
    y += hh
    for r_i, cells in enumerate(rows):
        rh = row_h(cells)
        if y + rh > PH - MB:
            new_page()
            x = ML; rect(ML, y, CW, hh, INK)
            for c, w in zip(headers, cw):
                put(x + pad, y + 0.20, c, fs, WHITE, "bold"); x += w
            y += hh
        rect(ML, y, CW, rh, GREY if r_i % 2 else WHITE)
        x = ML
        for j, (c, w) in enumerate(zip(cells, cw)):
            col = INK if j == 0 else BODY
            wt = "bold" if j == 0 else "normal"
            yy = y + 0.20
            for line in wrap(c, fs, "normal", w - 2 * pad):
                put(x + pad, yy, line, fs, col, wt)
                yy += fs / 72 * 1.25
            x += w
        y += rh
    y += 0.12

def frase(label, text):
    global y
    inner = CW - 0.6
    lines = wrap(label + text, 12, "normal", inner)
    h = 0.22 + len(lines) * (12 / 72 * 1.3) + 0.18
    ensure(h)
    rect(ML, y, CW, h, INK, rounded=True)
    yy = y + 0.30
    for i, line in enumerate(lines):
        if i == 0:
            put(PW / 2, yy, label, 12, TEAL, "bold", ha="center")
            yy += 12 / 72 * 1.4
        else:
            put(PW / 2, yy, line, 12, WHITE, "bold", ha="center")
            yy += 12 / 72 * 1.3
    y += h

# =================================================================== CAPA
new_page(cover=True)
image_top = 2.2
img = mpimg.imread(f"{A}/00_capa.png")
ar = img.shape[1] / img.shape[0]
w = CW; h = w / ar
ax = fig.add_axes([xf(ML), yf(image_top + h), w / PW, h / PH])
ax.imshow(img); ax.axis("off")
y = image_top + h + 0.5
put(PW / 2, y, "Documento Executivo", 14, SLATE, "bold", ha="center"); y += 0.32
put(PW / 2, y, "Infraestrutura de TI com IA em Google Cloud — versão econômica",
    11.5, BODY, ha="center"); y += 0.28
put(PW / 2, y, "Sem Vertex AI · apoiada em Claude Pro/Max + Gemini Business já contratados",
    10, SLATE, style="italic", ha="center"); y += 0.6
bw = 2.0; gapx = 0.15; total = bw * 3 + gapx * 2; x0 = ML + (CW - total) / 2
for k, v in [("VERSÃO", "1.0"), ("DATA", "Junho / 2026"), ("CLASSIFICAÇÃO", "Uso interno")]:
    rect(x0, y, bw, 0.6, LIGHT, rounded=True)
    put(x0 + bw / 2, y + 0.24, k, 8, SLATE, "bold", ha="center")
    put(x0 + bw / 2, y + 0.46, v, 11, INK, "bold", ha="center")
    x0 += bw + gapx

# =================================================================== 1 SUMÁRIO
new_page()
heading("", "Sumário Executivo")
paragraph("Esta é a versão enxuta e econômica da infraestrutura de TI com IA da "
          "setup.com.br. A infraestrutura roda em Google Cloud e Google Workspace, "
          "mas a camada de modelos — que era o maior custo na versão com Vertex AI, "
          "por ser cobrada por token — passa a se apoiar em assinaturas de valor "
          "fixo que a empresa já paga: Claude Pro/Max e Gemini Business.")
paragraph("O resultado é a mesma capacidade da arquitetura original ao menor custo "
          "incremental possível: a Vertex AI é eliminada, os modelos viram custo "
          "fixo já contratado e a infraestrutura de apoio cabe majoritariamente no "
          "free tier permanente do Google Cloud.")
callout("Em números:  ",
        "o gasto incremental da Operação (50 usuários) cai de ~US$ 1.150 para "
        "~US$ 280/mês (−75%); o Piloto (10 usuários) fica praticamente em R$ 0, "
        "coberto pelo free tier.")
image(f"{A}/01_camadas.png", 5.9, "Figura 1 — A infraestrutura em quatro camadas integradas.")

# =================================================================== 2 PRINCÍPIOS
new_page()
heading("1", "Princípios de economia")
paragraph("A estratégia de custo se apoia em reaproveitar o que já está contratado "
          "e usar os free tiers permanentes do Google Cloud:")
bullet("Não recomprar o que já existe — ", "Workspace, Gemini Business, Claude Pro/Max, WhatsApp (Meta), GitHub, host próprio e sistemas internos já estão pagos.")
bullet("Modelos por assinatura fixa, não por token — ", "Claude Pro/Max para o trabalho agêntico e Gemini Business para a produtividade no Workspace. Vertex AI eliminada.")
bullet("Free tier primeiro — ", "Cloud Run, Pub/Sub, Firestore, Logging e Firebase cabem majoritariamente no free tier permanente.")
bullet("Reuso do host próprio — ", "computer-use, transcrição de áudio (Whisper) e embeddings para RAG rodam no servidor que já existe.")
bullet("Governança por padrão — ", "identidade única, permissões mínimas, auditoria e DLP usando recursos já inclusos no Workspace.")

# =================================================================== 3 SUBSTITUIÇÃO
heading("2", "Como cada peça da Vertex AI é substituída")
table(["O que a Vertex fazia", "Alternativa sem Vertex (já contratada / grátis)"],
      [["Modelos do cérebro (Pro/Flash/Lite)", "Claude Pro/Max dirige o harness loop via Claude Code."],
       ["IA para usuário final", "Gemini Business no Workspace (Gmail/Docs/Sheets/Meet) + app Gemini."],
       ["RAG / Vector Search", "NotebookLM (no Gemini Business) + pgvector com embeddings open-source no host."],
       ["Speech-to-Text (áudio WhatsApp)", "Whisper (open-source) no host próprio, ou app Gemini."],
       ["Document AI (OCR)", "OCR nativo do Google Drive/Docs (grátis) ou Tesseract no host."],
       ["Agentes especializados", "Gems (Gemini Business) + sub-agentes do Claude Code."]],
      [0.34, 0.66])
callout("Trade-off honesto:  ",
        "assinaturas têm limites por seat/uso — atendem bem Piloto e Operação; em "
        "escala muito alta de automação backend pode ser preciso mais seats Max ou "
        "um fallback metered pontual.", bg=STEELT)

# =================================================================== 4 SERVIÇOS
new_page()
heading("3", "Serviços — contratar vs. reaproveitar")
subheading("Já contratados (reaproveitar, US$ 0 incremental)")
bullet("Google Workspace + Gemini Business — ", "e-mail, Docs, Sheets, Meet, Drive, SSO, Gemini nas apps, Gems, NotebookLM, Vault e DLP.")
bullet("Claude Pro/Max — ", "runtime dos agentes via Claude Code.")
bullet("WhatsApp Meta Cloud API — ", "canal de atendimento de produção.")
bullet("GitHub — ", "DevOps e chamados de engenharia.")
bullet("Host próprio — ", "computer-use, Whisper, embeddings e sistemas internos.")
subheading("A ativar no Google Cloud (majoritariamente free tier)")
table(["Serviço", "Para quê", "Custo"],
      [["Cloud Run", "MCP servers + webhook WhatsApp", "free → baixo"],
       ["Pub/Sub + Cloud Tasks", "Orquestração do loop", "free tier"],
       ["Firestore", "Estado de sessão/agentes", "free → baixo"],
       ["Cloud Storage", "Backup de artefatos", "baixo"],
       ["Secret Manager", "Chaves e tokens", "~US$ 0"],
       ["Cloud Identity + IAP", "SSO e acesso seguro", "incluído / US$ 0"],
       ["Cloud Logging/Monitoring", "Observabilidade", "free tier"],
       ["Looker Studio", "Painéis de indicadores", "grátis"],
       ["Firebase Hosting/Auth/FCM", "PWA mobile/tablet + push", "Spark grátis"]],
      [0.30, 0.46, 0.24])

# =================================================================== 5 PLANO
new_page()
heading("4", "Plano de implantação passo a passo (com custo)")
paragraph("Custos incrementais mensais no Google Cloud (US$ 1 ≈ R$ 5,50), cenário "
          "de referência Operação (50 usuários). O esforço de engenharia é interno "
          "(agente DevOps + Claude Code), não vira assinatura.")
subheading("Fase 0 — Fundação (semana 1)")
bullet("Passo 1 — ", "Projeto GCP + Billing + organização. Google Cloud · US$ 0 (crédito inicial US$ 300).")
bullet("Passo 2 — ", "SSO, grupos, MDM. Cloud Identity (Workspace já pago) · US$ 0.")
bullet("Passo 3 — ", "Migrar .env para cofre. Secret Manager · ~US$ 0.")
subheading("Fase 1 — Camada de IA nas assinaturas (semana 1–2)")
bullet("Passo 4 — ", "Harness loop + agentes via Claude Code. Claude Pro/Max · US$ 0 incremental.")
bullet("Passo 5 — ", "Gemini no Workspace + Gems + NotebookLM. Gemini Business · US$ 0 incremental.")
subheading("Fase 2 — Conectores MCP em produção (semana 2–4)")
bullet("Passo 6 — ", "Containerizar MCP (WhatsApp, Gmail, Calendar, Drive, GitHub). Cloud Run · US$ 0–50.")
bullet("Passo 7 — ", "Webhook WhatsApp (Meta já paga) em fila de eventos. Cloud Run + Pub/Sub · US$ 0–20.")
bullet("Passo 8 — ", "computer-use no servidor existente. Host próprio · US$ 0.")
subheading("Fase 3 — Memória e RAG sem Vertex (semana 4–6)")
bullet("Passo 9 — ", "Q&A nos documentos do Drive. NotebookLM · US$ 0.")
bullet("Passo 10 — ", "RAG programático com embeddings OSS. pgvector no host · US$ 0 (ou Cloud SQL ~US$ 50).")
bullet("Passo 11 — ", "Áudio→texto e OCR. Whisper OSS + OCR do Drive · US$ 0.")

new_page()
subheading("Fase 4 — Estado e dados (semana 5–6)")
bullet("Passo 12 — ", "Estado de sessão/agentes. Firestore · US$ 0–30.")
bullet("Passo 13 — ", "Expor sistemas internos como MCP. Onde já rodam · US$ 0 incremental.")
bullet("Passo 14 — ", "Backup dos artefatos (Drive = fonte da verdade). Cloud Storage · US$ 5–30.")
subheading("Fase 5 — Governança e observabilidade (semana 6–7)")
bullet("Passo 15 — ", "Acesso seguro. IAP (US$ 0) + Cloud Armor · US$ 0–20.")
bullet("Passo 16 — ", "Trilha de auditoria do loop. Cloud Audit Logs · US$ 0–20.")
bullet("Passo 17 — ", "Retenção/DLP. Vault + DLP do Workspace · US$ 0 incremental.")
bullet("Passo 18 — ", "Logs/métricas + painéis. Cloud Logging/Monitoring + Looker Studio · US$ 0–20.")
subheading("Fase 6 — Experiência multidispositivo (semana 7–8)")
bullet("Passo 19 — ", "PWA com login Workspace + push. Firebase Hosting/Auth/FCM · US$ 0–10.")
subheading("Fase 7 — Otimização contínua (mês 3+)")
bullet("Passo 20 — ", "Roteamento (Gems vs Claude), Committed Use Discounts (−20% a −55%), limpeza de logs. Efeito: reduz custo.")

# =================================================================== 6 ESTIMATIVA
new_page()
heading("5", "Custo acumulado e estimativa por cenário")
subheading("Acumulado por fase — Operação (50 usuários)")
table(["Acumulado até…", "Incremental/mês (US$)", "(R$)"],
      [["Fase 1 (IA no ar)", "~0", "~R$ 0"],
       ["Fase 2 (conectores)", "~0–70", "~R$ 0–385"],
       ["Fase 3 (RAG)", "~0–120", "~R$ 0–660"],
       ["Fase 4 (dados)", "~5–180", "~R$ 30–990"],
       ["Fase 5 (governança)", "~5–240", "~R$ 30–1.320"],
       ["Fase 6 (completo)", "~5–250", "~R$ 30–1.375"]],
      [0.40, 0.32, 0.28])
subheading("Por cenário (gasto incremental, sem Vertex)")
table(["Cenário", "Usuários", "Com Vertex (US$)", "Sem Vertex (US$)", "Sem Vertex (R$)"],
      [["Piloto", "10", "~450", "~150", "~R$ 800"],
       ["Operação", "50", "~1.150", "~280", "~R$ 1.550"],
       ["Escala", "150", "~3.200", "~900", "~R$ 4.950"]],
      [0.20, 0.16, 0.22, 0.21, 0.21])
callout("Resultado:  ",
        "eliminar a Vertex e apoiar a IA em Claude Pro + Gemini Business derruba o "
        "incremental da Operação em 75%. O Piloto fica praticamente em R$ 0, "
        "coberto pelo free tier permanente do Google Cloud.")
paragraph("Valores aproximados (referência Google Cloud/Workspace início de 2026; "
          "sujeitos a câmbio e tabela vigente). O custo só sobe de forma relevante "
          "se o volume de automação backend ultrapassar os limites das assinaturas.",
          italic=True, fs=9.5)
# =================================================================== 6 CONSOLE
new_page()
heading("6", "setupOS Cloud — console único (web app)")
paragraph("Uma interface web única reúne, em um só lugar, o painel de controle, um "
          "terminal operável, o Claude CLI e os principais serviços — atrás de login "
          "Google restrito ao domínio setup.com.br. Roda no mesmo stack econômico "
          "(Firebase Hosting + Cloud Run + MCP) e reaproveita o status-dashboard.html "
          "como semente do Painel. O scaffold inicial fica em console/ (web + gateway).")
subheading("Layout — workspace tipo cloud desktop")
bullet("Top bar — ", "logo, busca global (e-mails, arquivos, conversas, PRs via MCP), seletor de ambiente, notificações e usuário logado.")
bullet("Navegação (esquerda) — ", "módulos; clicar abre ou foca uma aba.")
bullet("Área de trabalho (centro) — ", "abas reordenáveis e fecháveis, com split view (ex.: Terminal + Claude CLI lado a lado).")
bullet("Painel contextual (direita) — ", "fila de aprovações human-in-the-loop, atividade dos agentes, custo do mês e alertas.")
subheading("Janelas principais")
table(["Janela", "O que faz", "Origem"],
      [["Painel", "Saúde dos MCP, status dos agentes, custo, aprovações", "evolui o status-dashboard.html"],
       ["Terminal", "Terminal web (xterm.js) por WebSocket a uma sessão pty", "Cloud Run + node-pty"],
       ["Claude CLI", "Claude Code interativo; loop e aprovações ao vivo", "Claude Pro/Max"],
       ["WhatsApp", "Conversas, enviar/responder/encaminhar", "MCP whatsapp-business"],
       ["Workspace", "Gmail, Calendar e Drive: triagem, agenda, arquivos", "MCP Google Workspace"],
       ["GitHub", "PRs, CI, issues, revisões", "MCP github"],
       ["Sistemas internos", "Projetos, contratos e comercial embutidos", "conectores MCP existentes"],
       ["Agentes/Governança", "Catálogo de agentes; auditoria e custo", "Claude Code + Audit Logs"]],
      [0.24, 0.52, 0.24])

new_page()
heading("7", "Login — Google Auth, somente setup.com.br")
bullet("Firebase Auth + Google OAuth — ", "com hd=setup.com.br para conveniência na tela de seleção de conta.")
bullet("Validação obrigatória no backend — ", "o Cloud Run rejeita token sem email_verified ou cujo domínio seja diferente de setup.com.br; a verdade é checada no servidor, nunca no cliente.")
bullet("IAP na frente do Cloud Run — ", "libera apenas o grupo do Cloud Identity.")
bullet("RBAC por grupo do Workspace — ", "abas sensíveis (Terminal, Claude CLI, Governança) só aparecem para grupos autorizados, reusando a allowlist que já existe no projeto (WA_AGENT_GROUPS).")
callout("Fluxo:  ",
        "Firebase Auth (Google, hd=setup.com.br) → Cloud Run verifica o ID token "
        "(email_verified e domínio == setup.com.br) → IAP (grupo Cloud Identity) → "
        "RBAC por grupo decide quais abas e ações o usuário enxerga.", bg=STEELT)
subheading("Stack (coerente com a versão sem Vertex)")
table(["Camada", "Tecnologia", "Custo"],
      [["Frontend (PWA, abas, xterm.js)", "React/Next.js em Firebase Hosting", "Spark grátis"],
       ["Auth", "Firebase Auth (Google) + IAP", "grátis / US$ 0"],
       ["Gateway WebSocket + REST/SSE", "Cloud Run (node-pty, ponte MCP)", "free → baixo"],
       ["Tempo real / estado", "Firestore + Pub/Sub + FCM", "free tier"],
       ["Terminal & Claude CLI", "pty no host/Cloud Run + Claude Code", "já contratado"],
       ["Serviços", "MCP servers já existentes", "reuso"]],
      [0.34, 0.42, 0.24])
paragraph("O console é apenas uma casca web unificada sobre os MCP servers e o "
          "Claude Code que já existem, com login corporativo e governança por "
          "padrão — sem novo custo de modelo.", italic=True)

frase("Em uma frase",
      "a mesma inteligência em cada tela, agora ao menor custo possível — modelos "
      "já pagos, infraestrutura no free tier e governança por padrão.")

_footer(); pdf.savefig(fig); plt.close(fig)
pdf.close()
print("PDF do documento gerado:", OUT, "—", pageno, "páginas")
