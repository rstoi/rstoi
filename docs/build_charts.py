#!/usr/bin/env python3
"""Gera os elementos gráficos (PNG) para o documento executivo."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.font_manager as fm
import numpy as np

# Paleta corporativa
INK    = "#0F2740"   # azul-petróleo escuro (texto/títulos)
BLUE   = "#1F6FEB"   # azul primário
TEAL   = "#0FB5AE"   # ciano de destaque
AMBER  = "#F5A623"   # âmbar (atenção/humano)
SLATE  = "#5B6B7B"   # cinza-azulado
LIGHT  = "#EAF2FB"   # azul muito claro (fundos)
LIGHT2 = "#E6F7F6"   # ciano claro
GREY   = "#F2F5F8"
WHITE  = "#FFFFFF"

plt.rcParams["font.family"] = "DejaVu Sans"

A = "/home/user/rstoi/docs/assets"


def rounded(ax, x, y, w, h, fc, ec="none", lw=0, r=0.02, alpha=1.0):
    p = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                       fc=fc, ec=ec, lw=lw, alpha=alpha, mutation_aspect=1)
    ax.add_patch(p)
    return p


def text(ax, x, y, s, size, color=INK, weight="normal", ha="center", va="center"):
    style = "normal"
    if weight == "italic":
        style, weight = "italic", "normal"
    ax.text(x, y, s, fontsize=size, color=color, weight=weight, style=style,
            ha=ha, va=va, zorder=5)


# ---------------------------------------------------------------------------
# 1. ARQUITETURA EM CAMADAS
# ---------------------------------------------------------------------------
def fig_camadas():
    fig, ax = plt.subplots(figsize=(9.2, 6.2), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")

    layers = [
        ("EXPERIÊNCIA", "PC · Notebook · Tablet · Smartphone · WhatsApp · Chat/IDE",
         "Onde o profissional interage — a mesma IA em cada tela", BLUE, LIGHT, 78),
        ("ORQUESTRAÇÃO — “o cérebro”", "Roteador multimodelo · Harness loop · Memória · Catálogo de agentes",
         "Decide o modelo, conduz o ciclo e mantém o contexto", TEAL, LIGHT2, 56.5),
        ("FERRAMENTAS / CONECTORES  (MCP)", "WhatsApp · Google Workspace · GitHub · computer-use · Sistemas internos (Projetos/Contratos/Comercial)",
         "A “tomada universal” que liga a IA aos sistemas reais", SLATE, GREY, 35),
        ("DADOS E GOVERNANÇA", "SSO Google · Cofre de segredos · Auditoria · DLP · Backup",
         "Segurança, permissões mínimas e conformidade por padrão", INK, "#E8ECF1", 13.5),
    ]
    for title, mid, sub, accent, bg, y in layers:
        rounded(ax, 6, y, 88, 18, bg, r=0.03)
        rounded(ax, 6, y, 1.6, 18, accent, r=0.03)  # barra lateral
        text(ax, 10.5, y + 14.0, title, 12.5, accent, "bold", ha="left")
        text(ax, 10.5, y + 8.4, mid, 8.6, INK, "normal", ha="left")
        text(ax, 10.5, y + 3.4, sub, 8.4, SLATE, "italic", ha="left")

    # setas entre camadas (fluxo bidirecional de contexto)
    for y0, y1 in [(76, 74.7), (54.5, 53.2), (33, 31.7)]:
        ar = FancyArrowPatch((50, y0), (50, y1 - 0.3), arrowstyle="-|>",
                             mutation_scale=16, color=INK, lw=1.6, zorder=6)
        ax.add_patch(ar)

    text(ax, 50, 98, "Arquitetura de TI com IA — visão em camadas",
         15, INK, "bold")
    fig.savefig(f"{A}/01_camadas.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 2. HARNESS LOOP
# ---------------------------------------------------------------------------
def fig_loop():
    fig, ax = plt.subplots(figsize=(8.6, 5.6), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    text(ax, 50, 95, "Harness loop — como o agente entrega trabalho",
         15, INK, "bold")
    text(ax, 50, 87, "Planeja → age → observa → corrige, até concluir (com aprovação humana nas ações críticas)",
         9, SLATE, "italic")

    nodes = [
        ("1 · PLANEJAR", "Entende o pedido e\ntraça os passos", 26, 62, BLUE),
        ("2 · AGIR", "Chama uma ferramenta\nMCP real", 74, 62, TEAL),
        ("3 · OBSERVAR", "Lê o resultado da\nação executada", 74, 26, SLATE),
        ("4 · REFLETIR", "Corrige e decide o\npróximo passo", 26, 26, AMBER),
    ]
    r = 15
    for label, desc, x, y, c in nodes:
        rounded(ax, x - r, y - r * 0.62, 2 * r, 2 * r * 0.62, c, r=0.18)
        text(ax, x, y + 4.5, label, 11, WHITE, "bold")
        text(ax, x, y - 3.5, desc, 8.2, WHITE)

    # setas circulares
    arrows = [((40, 65), (60, 65)), ((76, 50), (76, 40)),
              ((60, 23), (40, 23)), ((24, 40), (24, 50))]
    for (x0, y0), (x1, y1) in arrows:
        ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>",
                     mutation_scale=20, color=INK, lw=2,
                     connectionstyle="arc3,rad=0.18", zorder=6))

    text(ax, 50, 44, "REPETE", 10, INK, "bold")
    fig.savefig(f"{A}/02_loop.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 3. ROTEAMENTO MULTIMODELO (custo x capacidade)
# ---------------------------------------------------------------------------
def fig_modelos():
    fig, ax = plt.subplots(figsize=(8.8, 5.2), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    text(ax, 50, 95, "Multimodelo — a IA certa para cada tarefa", 15, INK, "bold")

    tiers = [
        ("HAIKU", "Triagem, classificação,\nroteamento, alta frequência",
         "Rápido · baixo custo", TEAL, 12),
        ("SONNET", "Volume do dia a dia: e-mails,\nresumos, WhatsApp, planilhas",
         "Equilíbrio custo/qualidade", BLUE, 40),
        ("OPUS", "Raciocínio complexo, código,\njurídico e financeiro",
         "Máxima capacidade", INK, 68),
    ]
    for name, use, tag, c, x in tiers:
        h = 20 + (x / 68) * 34   # barras crescentes
        rounded(ax, x, 18, 22, h, c, r=0.06)
        text(ax, x + 11, 18 + h - 5, name, 13, WHITE, "bold")
        text(ax, x + 11, 18 + h / 2 - 2, use, 8.0, WHITE)
        text(ax, x + 11, 13, tag, 8.0, c, "bold")

    # eixo escala
    ax.add_patch(FancyArrowPatch((9, 16), (92, 16), arrowstyle="-|>",
                 mutation_scale=14, color=SLATE, lw=1.4))
    text(ax, 50, 9.5, "menor custo / latência   →   maior capacidade",
         9, SLATE, "italic")
    text(ax, 50, 84, "Regra: começar barato e escalar só quando a tarefa exige",
         9.5, SLATE, "italic")
    fig.savefig(f"{A}/03_modelos.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 4. ROADMAP (timeline 4 fases)
# ---------------------------------------------------------------------------
def fig_roadmap():
    fig, ax = plt.subplots(figsize=(9.4, 4.4), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    text(ax, 50, 94, "Roadmap de implantação", 15, INK, "bold")

    # linha base
    ax.plot([8, 92], [50, 50], color=SLATE, lw=2.2, zorder=1)
    phases = [
        ("FASE 1", "Fundação", "SSO, cofre e\nMCPs no ar", "Início", BLUE, 18, True),
        ("FASE 2", "Conectar o que há", "Projetos, Contratos\ne Comercial", "Em seguida", TEAL, 40, False),
        ("FASE 3", "Agentes + RAG", "Base de conhec.\n+ multidisp.", "Sequência", AMBER, 62, True),
        ("FASE 4", "Governança", "Auditoria, DLP\ne indicadores", "Contínuo", INK, 84, False),
    ]
    for ph, title, desc, when, c, x, up in phases:
        ax.add_patch(plt.Circle((x, 50), 2.6, color=c, zorder=3))
        ax.add_patch(plt.Circle((x, 50), 2.6, fill=False, ec=WHITE, lw=1.5, zorder=4))
        y = 64 if up else 36
        rounded(ax, x - 10, y - (0 if up else 16), 20, 16, c, r=0.10)
        yc = y + 8 if up else y - 8
        text(ax, x, yc + 4.4, ph, 9.5, WHITE, "bold")
        text(ax, x, yc + 0.0, title, 8.2, WHITE, "bold")
        text(ax, x, yc - 4.6, desc, 7.0, WHITE)
        text(ax, x, 50 + (8.5 if not up else -8.5), when, 8.0, c, "bold")
    fig.savefig(f"{A}/04_roadmap.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 5. FRAMEWORK DE INDICADORES (sem números — medidos sobre a própria operação)
# ---------------------------------------------------------------------------
def fig_indicadores():
    fig, ax = plt.subplots(figsize=(9.0, 5.4), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    text(ax, 50, 95, "Framework de indicadores", 15, INK, "bold")
    text(ax, 50, 88,
         "O que acompanhar — sem números presumidos: a linha de base é medida na "
         "operação e as metas saem dela",
         8.6, SLATE, "italic")

    cards = [
        ("PRODUTIVIDADE", BLUE, LIGHT,
         ["Tempo poupado por pessoa", "Retrabalho evitado",
          "Tarefas automatizadas"], 6, 47),
        ("QUALIDADE", TEAL, LIGHT2,
         ["Consistência dos entregáveis", "Erros e correções",
          "Tempo de 1ª resposta"], 51, 47),
        ("PESSOAS & CLIMA", AMBER, "#FDF3E0",
         ["Sobrecarga percebida", "eNPS / satisfação",
          "Segurança psicológica"], 6, 9),
        ("SEGURANÇA & GOVERNANÇA", INK, "#E8ECF1",
         ["Incidentes com dados", "% de ações auditadas",
          "Aderência a permissões"], 51, 9),
    ]
    w, h = 43, 33
    for title, accent, bg, items, x, y in cards:
        rounded(ax, x, y, w, h, bg, r=0.05)
        rounded(ax, x, y + h - 6.5, w, 6.5, accent, r=0.05)
        rounded(ax, x, y + h - 6.5, w, 3, accent, r=0.0)  # quadra o canto inferior da faixa
        text(ax, x + w/2, y + h - 3.2, title, 11, WHITE, "bold")
        for i, it in enumerate(items):
            yy = y + h - 12 - i * 6.2
            ax.add_patch(plt.Circle((x + 4.5, yy + 0.6), 0.9, color=accent, zorder=5))
            text(ax, x + 7.5, yy, it, 9.0, INK, "normal", ha="left")
    fig.savefig(f"{A}/05_indicadores.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 6. PESSOAS — clima, segurança psicológica e condições de trabalho
# ---------------------------------------------------------------------------
def fig_pessoas():
    fig, ax = plt.subplots(figsize=(9.4, 5.2), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    text(ax, 50, 95, "Pessoas no centro", 15, INK, "bold")
    text(ax, 50, 88,
         "A IA assume o trabalho repetitivo e penoso — e devolve tempo, energia e tranquilidade",
         9, SLATE, "italic")

    steps = [
        ("IA assume\no repetitivo", "Triagem, status de\nprojetos, documentos", BLUE, 13.5),
        ("Libera tempo\ne energia", "Foco no que é\ncriativo e humano", TEAL, 37.8),
        ("Menos sobrecarga\ne menos erro", "Rascunho revisável\nantes de agir", AMBER, 62.2),
        ("Mais clima e\nseg. psicológica", "Confiança para\npropor e pedir ajuda", "#2E8B57", 86.5),
    ]
    bw = 21
    for i, (title, desc, c, x) in enumerate(steps):
        rounded(ax, x - bw/2, 50, bw, 22, c, r=0.10)
        text(ax, x, 65, title, 8.8, WHITE, "bold")
        text(ax, x, 56, desc, 7.2, WHITE)
        if i < 3:
            ax.add_patch(FancyArrowPatch((x + bw/2, 61), (steps[i+1][3] - bw/2 - 0.5, 61),
                         arrowstyle="-|>", mutation_scale=15, color=INK, lw=1.8, zorder=6))

    # princípios (chips)
    text(ax, 50, 38, "Princípios que sustentam a confiança", 10, INK, "bold")
    chips = [
        ("Aumenta, não vigia", BLUE),
        ("Mentor sem julgar", TEAL),
        ("Erro fica no rascunho", AMBER),
        ("Decisão é humana", INK),
    ]
    cw, gap = 22, 2
    total = len(chips) * cw + (len(chips) - 1) * gap
    x0 = (100 - total) / 2
    for i, (label, c) in enumerate(chips):
        x = x0 + i * (cw + gap)
        rounded(ax, x, 20, cw, 11, "#FFFFFF", ec=c, lw=1.6, r=0.18)
        rounded(ax, x, 20, 1.4, 11, c, r=0.0)
        text(ax, x + cw/2 + 0.7, 25.5, label, 7.6, INK, "bold")
    fig.savefig(f"{A}/06_pessoas.png", bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Banner de capa
# ---------------------------------------------------------------------------
def fig_capa():
    fig, ax = plt.subplots(figsize=(9.5, 3.0), dpi=200)
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    rounded(ax, 0, 0, 100, 100, INK, r=0.0)
    # acento geométrico
    for i, c in enumerate([BLUE, TEAL, AMBER]):
        rounded(ax, 2 + i * 1.6, 0, 1.2, 100, c, r=0.0)
    text(ax, 8, 66, "setup.com.br", 13, TEAL, "bold", ha="left")
    text(ax, 8, 45, "Infraestrutura de TI com IA", 24, WHITE, "bold", ha="left")
    text(ax, 8, 25, "Produtividade aumentada por agentes, multimodelo e harness loop",
         11.5, "#AFC6E0", "normal", ha="left")
    fig.savefig(f"{A}/00_capa.png", bbox_inches="tight", facecolor=WHITE, pad_inches=0)
    plt.close(fig)


if __name__ == "__main__":
    fig_capa()
    fig_camadas()
    fig_loop()
    fig_modelos()
    fig_roadmap()
    fig_indicadores()
    fig_pessoas()
    print("Gráficos gerados em", A)
