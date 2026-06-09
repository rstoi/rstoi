#!/usr/bin/env python3
"""Gera o deck executivo .pptx (16:9) a partir dos mesmos gráficos do documento."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from PIL import Image

A = "/home/user/rstoi/docs/assets"
OUT = "/home/user/rstoi/docs/Infraestrutura-IA-setup.com.br.pptx"

INK   = RGBColor(0x0F, 0x27, 0x40)
BLUE  = RGBColor(0x1F, 0x6F, 0xEB)
TEAL  = RGBColor(0x0F, 0xB5, 0xAE)
AMBER = RGBColor(0xF5, 0xA6, 0x23)
GREEN = RGBColor(0x2E, 0x8B, 0x57)
SLATE = RGBColor(0x5B, 0x6B, 0x7B)
BODY  = RGBColor(0x21, 0x2B, 0x36)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT = RGBColor(0xEA, 0xF2, 0xFB)
PALE  = RGBColor(0xF2, 0xF5, 0xF8)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]

FONT = "Calibri"
FONT_L = "Calibri Light"


def slide():
    return prs.slides.add_slide(BLANK)


def rect(s, x, y, w, h, color, line=None, shadow=False):
    sp = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    sp.fill.solid(); sp.fill.fore_color.rgb = color
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line; sp.line.width = Pt(1)
    sp.shadow.inherit = False
    return sp


def rrect(s, x, y, w, h, color, line=None):
    sp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    sp.adjustments[0] = 0.08
    sp.fill.solid(); sp.fill.fore_color.rgb = color
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line; sp.line.width = Pt(1.5)
        sp.fill.background()
    sp.shadow.inherit = False
    return sp


def txt(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
        space_after=6, line_spacing=1.05):
    """runs: list of paragraphs; each paragraph is list of (text, size, color, bold, italic, font)."""
    tb = s.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0; tf.margin_right = 0
    tf.margin_top = 0; tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        p.space_before = Pt(0)
        p.line_spacing = line_spacing
        for (t, size, color, bold, italic, font) in para:
            r = p.add_run(); r.text = t
            r.font.size = Pt(size); r.font.color.rgb = color
            r.font.bold = bold; r.font.italic = italic; r.font.name = font
    return tb


def R(t, size, color=BODY, bold=False, italic=False, font=FONT):
    return (t, size, color, bold, italic, font)


def footer(s, page):
    txt(s, Inches(0.55), Inches(7.06), Inches(9), Inches(0.3),
        [[R("setup.com.br  ·  Infraestrutura de TI com IA  ·  Documento Executivo",
            9, SLATE)]])
    txt(s, Inches(11.8), Inches(7.06), Inches(1.0), Inches(0.3),
        [[R(str(page), 9, SLATE, bold=True)]], align=PP_ALIGN.RIGHT)


def title_band(s, kicker, title, accent=BLUE):
    """Faixa de título no topo para slides de texto."""
    rect(s, 0, 0, SW, Inches(1.5), INK)
    rect(s, 0, 0, Inches(0.18), Inches(1.5), accent)
    txt(s, Inches(0.6), Inches(0.26), Inches(12), Inches(0.4),
        [[R(kicker.upper(), 12, TEAL, bold=True)]])
    txt(s, Inches(0.6), Inches(0.62), Inches(12.1), Inches(0.8),
        [[R(title, 26, WHITE, bold=True)]])


def kicker_tag(s, kicker, accent=BLUE):
    """Etiqueta discreta para slides cujo gráfico já tem título próprio."""
    rect(s, 0, 0, Inches(0.18), Inches(0.9), accent)
    txt(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.4),
        [[R(kicker.upper(), 13, INK, bold=True)]])


def add_image_fit(s, path, max_w_in, max_h_in, cx_in, top_in):
    """Coloca imagem preservando proporção, centralizada horizontalmente em cx_in."""
    with Image.open(path) as im:
        iw, ih = im.size
    ar = iw / ih
    w = max_w_in; h = w / ar
    if h > max_h_in:
        h = max_h_in; w = h * ar
    left = Inches(cx_in - w / 2)
    s.shapes.add_picture(path, left, Inches(top_in), Inches(w), Inches(h))
    return w, h


def bullets(s, items, x_in, y_in, w_in, size=16, gap=10, accent=BLUE):
    """items: list of (prefix_bold, text) — prefix em accent/negrito."""
    tb = s.shapes.add_textbox(Inches(x_in), Inches(y_in), Inches(w_in), Inches(5))
    tf = tb.text_frame; tf.word_wrap = True
    tf.margin_left = 0; tf.margin_top = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap); p.line_spacing = 1.05
        r = p.add_run(); r.text = "▸  "
        r.font.size = Pt(size); r.font.color.rgb = accent; r.font.bold = True; r.font.name = FONT
        if item[0]:
            r = p.add_run(); r.text = item[0]
            r.font.size = Pt(size); r.font.color.rgb = INK; r.font.bold = True; r.font.name = FONT
        r = p.add_run(); r.text = item[1]
        r.font.size = Pt(size); r.font.color.rgb = BODY; r.font.name = FONT
    return tb


# ============================================================ 1 · CAPA
s = slide()
rect(s, 0, 0, SW, SH, INK)
for i, c in enumerate([BLUE, TEAL, AMBER]):
    rect(s, Inches(0.3 + i * 0.22), 0, Inches(0.16), SH, c)
txt(s, Inches(1.1), Inches(2.0), Inches(11), Inches(0.5),
    [[R("setup.com.br", 22, TEAL, bold=True)]])
txt(s, Inches(1.1), Inches(2.7), Inches(11.4), Inches(1.6),
    [[R("Infraestrutura de TI com IA", 48, WHITE, bold=True)]])
txt(s, Inches(1.12), Inches(4.3), Inches(11), Inches(0.6),
    [[R("Produtividade aumentada por agentes, multimodelo e harness loop",
        18, RGBColor(0xAF, 0xC6, 0xE0))]])
txt(s, Inches(1.12), Inches(5.0), Inches(11), Inches(0.6),
    [[R("Integração: PC · Notebook · Tablet · Smartphone · WhatsApp · Google Workspace",
        13, RGBColor(0x8F, 0xA8, 0xC4), italic=True)]])
txt(s, Inches(1.1), Inches(6.5), Inches(11), Inches(0.4),
    [[R("Documento Executivo   ·   v1.0   ·   Junho / 2026   ·   Uso interno",
        11, RGBColor(0x6E, 0x84, 0xA0), bold=True)]])

# ============================================================ 2 · SUMÁRIO / 3 PILARES
s = slide()
title_band(s, "Sumário Executivo", "Uma IA, em cada tela — operando de verdade")
txt(s, Inches(0.6), Inches(1.75), Inches(12.1), Inches(1.0),
    [[R("Cada profissional ganha um assistente único — no notebook, no celular, "
        "no tablet e pelo WhatsApp — que entende o contexto da empresa, atua sobre "
        "os sistemas internos (projetos, contratos, comercial) e executa tarefas "
        "de ponta a ponta, sempre sob controle humano nas decisões críticas.",
        15, BODY)]], line_spacing=1.1)
# três pilares (cards)
cards = [
    ("MULTIMODELO", "A IA certa para cada tarefa,\nequilibrando custo e qualidade.", BLUE),
    ("HARNESS LOOP", "Planeja → age → observa → corrige\naté concluir o trabalho.", TEAL),
    ("CONECTORES MCP", "Liga a IA aos sistemas reais:\nWhatsApp, Workspace, internos.", AMBER),
]
cw, ch, gap = Inches(3.95), Inches(2.0), Inches(0.28)
x0 = Inches(0.6)
for i, (t, d, c) in enumerate(cards):
    x = x0 + i * (cw + gap)
    card = rrect(s, x, Inches(3.2), cw, ch, PALE)
    rect(s, x, Inches(3.2), cw, Inches(0.12), c)
    txt(s, x + Inches(0.3), Inches(3.5), cw - Inches(0.6), Inches(0.5),
        [[R(t, 16, c, bold=True)]])
    txt(s, x + Inches(0.3), Inches(4.05), cw - Inches(0.6), Inches(1.2),
        [[R(d, 13.5, BODY)]], line_spacing=1.1)
# faixa resultado esperado
rrect(s, Inches(0.6), Inches(5.55), Inches(12.13), Inches(1.15), RGBColor(0xE6, 0xF7, 0xF6))
txt(s, Inches(0.95), Inches(5.78), Inches(11.6), Inches(0.8),
    [[R("Resultado esperado:  ", 14, INK, bold=True),
      R("menos tempo em tarefas repetitivas e mais qualidade nos entregáveis — e, "
        "no mesmo movimento, equipes menos sobrecarregadas, com mais segurança "
        "psicológica e melhores condições de trabalho.", 14, BODY)]],
    anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.08)
footer(s, 2)

# ============================================================ 3 · ARQUITETURA (fig)
s = slide()
kicker_tag(s, "Arquitetura — visão em camadas")
add_image_fit(s, f"{A}/01_camadas.png", 9.6, 5.7, 6.666, 1.15)
footer(s, 3)

# ============================================================ 4 · UM ASSISTENTE EM CADA TELA
s = slide()
title_band(s, "Experiência", "Um assistente em cada tela", BLUE)
txt(s, Inches(0.6), Inches(1.72), Inches(12.1), Inches(0.7),
    [[R("O mesmo agente, com o mesmo contexto, em qualquer dispositivo. "
        "O profissional escolhe o canal mais conveniente.", 15, BODY)]], line_spacing=1.1)
devs = [
    ("PC / Notebook", "Produção: documentos, planilhas, código, análise e operação do computador.", BLUE),
    ("Tablet", "Revisão, aprovação e leitura de resumos; ditado de tarefas em reunião.", TEAL),
    ("Smartphone", "Captura rápida (foto de nota, áudio), consulta de agenda e aprovações.", AMBER),
    ("WhatsApp", "Canal mais natural no Brasil: conversa por texto/áudio; clientes atendidos por agentes.", GREEN),
    ("Chat web / IDE", "Trabalho técnico e suporte: copiloto interno das equipes.", SLATE),
]
y = 2.6
for name, desc, c in devs:
    rrect(s, Inches(0.6), Inches(y), Inches(3.1), Inches(0.62), c)
    txt(s, Inches(0.6), Inches(y), Inches(3.1), Inches(0.62),
        [[R(name, 14, WHITE, bold=True)]], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    txt(s, Inches(3.95), Inches(y), Inches(8.8), Inches(0.62),
        [[R(desc, 14, BODY)]], anchor=MSO_ANCHOR.MIDDLE)
    y += 0.78
footer(s, 4)

# ============================================================ 5 · MULTIMODELO (fig)
s = slide()
kicker_tag(s, "Multimodelo — a IA certa para cada tarefa", BLUE)
add_image_fit(s, f"{A}/03_modelos.png", 8.6, 4.9, 6.666, 1.0)
txt(s, Inches(1.0), Inches(6.05), Inches(11.3), Inches(0.9),
    [[R("Modelos especializados complementam o texto: transcrição de áudio "
        "(WhatsApp/reuniões), visão/OCR (notas e contratos) e busca semântica "
        "sobre a base de conhecimento.", 13.5, SLATE, italic=True)]],
    align=PP_ALIGN.CENTER, line_spacing=1.1)
footer(s, 5)

# ============================================================ 6 · HARNESS LOOP (fig + exemplo)
s = slide()
kicker_tag(s, "Harness loop — de chatbot a agente que entrega", TEAL)
add_image_fit(s, f"{A}/02_loop.png", 6.4, 5.0, 3.7, 1.15)
txt(s, Inches(7.5), Inches(1.45), Inches(5.3), Inches(0.5),
    [[R("Exemplo: fechar proposta", 16, INK, bold=True)]])
bullets(s, [
    ("Planejar — ", "o vendedor pede pelo WhatsApp."),
    ("Agir/Observar — ", "busca histórico no Drive e Gmail, gera a proposta, agenda no Calendar."),
    ("Aprovar — ", "envia o resumo ao vendedor; se houver ajuste, o loop reabre."),
], 7.5, 2.1, 5.3, size=14, gap=9, accent=TEAL)
rrect(s, Inches(7.5), Inches(5.0), Inches(5.3), Inches(1.5), RGBColor(0xFD, 0xF3, 0xE0))
txt(s, Inches(7.78), Inches(5.2), Inches(4.8), Inches(1.2),
    [[R("Controle humano:  ", 13, INK, bold=True),
      R("ações de baixo risco são automáticas; envios e alterações irreversíveis "
        "exigem aprovação.", 13, BODY)]], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.08)
footer(s, 6)

# ============================================================ 7 · AGENTES
s = slide()
title_band(s, "Agentes", "Catálogo de agentes especializados", BLUE)
txt(s, Inches(0.6), Inches(1.7), Inches(12.1), Inches(0.5),
    [[R("Cada agente tem escopo e permissões próprios, usa o harness loop e o "
        "roteamento multimodelo — e pode delegar a sub-agentes.", 14.5, BODY)]],
    line_spacing=1.05)
agents = [
    ("Assistente Executivo", "E-mail, agenda, resumos, reuniões", BLUE),
    ("Atendimento / SDR", "Clientes no WhatsApp, leads, demos", TEAL),
    ("PMO / Projetos", "Status, relatórios e riscos", AMBER),
    ("Contratos", "Minutas, prazos, OCR", GREEN),
    ("Suporte / Helpdesk", "Chamados, runbooks, máquinas", SLATE),
    ("DevOps / Engenharia", "PRs, CI, evolui sist. internos", BLUE),
    ("Financeiro", "Conciliação, despesas, relatórios", TEAL),
]
cw, ch = Inches(3.95), Inches(1.05)
gx, gy = Inches(0.28), Inches(0.28)
x0, y0 = Inches(0.6), Inches(2.45)
for i, (name, desc, c) in enumerate(agents):
    col = i % 3; row = i // 3
    x = x0 + col * (cw + gx); y = y0 + row * (ch + gy)
    rrect(s, x, y, cw, ch, PALE)
    rect(s, x, y, Inches(0.1), ch, c)
    txt(s, x + Inches(0.3), y + Inches(0.13), cw - Inches(0.5), Inches(0.4),
        [[R(name, 14.5, c, bold=True)]])
    txt(s, x + Inches(0.3), y + Inches(0.55), cw - Inches(0.5), Inches(0.4),
        [[R(desc, 12.5, BODY)]])
footer(s, 7)

# ============================================================ 8 · SISTEMAS INTERNOS
s = slide()
title_band(s, "Sistemas internos", "Integrar e fortalecer o que já existe", AMBER)
txt(s, Inches(0.6), Inches(1.72), Inches(12.1), Inches(0.9),
    [[R("A setup.com.br já desenvolveu, em ", 15, BODY),
      R("vibe coding", 15, INK, bold=True),
      R(", sistemas de projetos, contratos e comercial. A infraestrutura ", 15, BODY),
      R("não os substitui", 15, INK, bold=True),
      R(" — encapsula como conectores e os coloca no alcance dos agentes.", 15, BODY)]],
    line_spacing=1.1)
# duas colunas
rrect(s, Inches(0.6), Inches(2.9), Inches(5.95), Inches(3.4), LIGHT)
txt(s, Inches(0.9), Inches(3.05), Inches(5.4), Inches(0.4),
    [[R("INTEGRAR  →  viram conectores", 15, BLUE, bold=True)]])
bullets(s, [
    ("Projetos — ", "PMO atualiza status, relatórios e riscos."),
    ("Contratos — ", "gera minutas, acompanha prazos, renova."),
    ("Comercial — ", "qualifica leads e move o funil."),
], 0.95, 3.55, 5.3, size=13.5, gap=9, accent=BLUE)
rrect(s, Inches(6.78), Inches(2.9), Inches(5.95), Inches(3.4), RGBColor(0xE6, 0xF7, 0xF6))
txt(s, Inches(7.08), Inches(3.05), Inches(5.4), Inches(0.4),
    [[R("FORTALECER  →  saúde dos sistemas", 15, TEAL, bold=True)]])
txt(s, Inches(7.08), Inches(3.6), Inches(5.4), Inches(2.4),
    [[R("Sistemas em vibe coding entregam rápido, mas acumulam dívida técnica. "
        "O agente de DevOps adiciona testes, revisa alterações e documenta — "
        "reduzindo retrabalho e aumentando a confiabilidade.", 14, BODY)],
     [R("O investimento já feito é preservado e ampliado, não descartado.",
        14, INK, bold=True)]], line_spacing=1.12, space_after=8)
footer(s, 8)

# ============================================================ 9 · PESSOAS (fig)
s = slide()
kicker_tag(s, "Pessoas no centro — clima, segurança psicológica e condições de trabalho", GREEN)
add_image_fit(s, f"{A}/06_pessoas.png", 10.4, 4.7, 6.666, 1.1)
txt(s, Inches(0.9), Inches(6.0), Inches(11.5), Inches(0.9),
    [[R("A IA aumenta as pessoas — não as vigia. ", 14, INK, bold=True),
      R("Com rascunho revisável e aprovação humana, o custo de errar cai; "
        "equipes menos sobrecarregadas colaboram melhor e retêm talentos.",
        14, BODY)]], align=PP_ALIGN.CENTER, line_spacing=1.1)
footer(s, 9)

# ============================================================ 10 · GOVERNANÇA
s = slide()
title_band(s, "Governança", "Segurança e governança — não-negociável", INK)
bullets(s, [
    ("Identidade única (SSO) — ", "via Google Workspace; o agente age como o usuário, herdando só as permissões dele."),
    ("Permissões mínimas — ", "cada conector recebe apenas os escopos necessários."),
    ("Aprovação de ações externas — ", "envios, exclusões e alterações irreversíveis passam por confirmação humana."),
    ("Segredos protegidos — ", "chaves e tokens em cofre (Vault / Secret Manager), nunca no código."),
    ("Auditoria completa — ", "cada passo do loop é registrado para conformidade."),
    ("Isolamento de dados — ", "dados da empresa não treinam modelos públicos; ambientes com não retenção."),
], 0.7, 2.0, 12.0, size=15.5, gap=11, accent=INK)
footer(s, 10)

# ============================================================ 11 · ROADMAP (fig)
s = slide()
kicker_tag(s, "Roadmap de implantação", AMBER)
add_image_fit(s, f"{A}/04_roadmap.png", 11.0, 5.4, 6.666, 1.2)
footer(s, 11)

# ============================================================ 12 · INDICADORES (fig)
s = slide()
kicker_tag(s, "Framework de indicadores — medidos, não presumidos", INK)
add_image_fit(s, f"{A}/05_indicadores.png", 9.2, 5.1, 6.666, 1.05)
txt(s, Inches(1.0), Inches(6.25), Inches(11.3), Inches(0.6),
    [[R("Sem números presumidos: a linha de base é medida na própria operação e "
        "as metas saem dela.", 13.5, SLATE, italic=True)]],
    align=PP_ALIGN.CENTER, line_spacing=1.05)
footer(s, 12)

# ============================================================ 13 · FECHAMENTO
s = slide()
rect(s, 0, 0, SW, SH, INK)
for i, c in enumerate([BLUE, TEAL, AMBER]):
    rect(s, Inches(0.3 + i * 0.22), 0, Inches(0.16), SH, c)
txt(s, Inches(1.2), Inches(2.4), Inches(11), Inches(0.6),
    [[R("EM UMA FRASE", 16, TEAL, bold=True)]])
txt(s, Inches(1.2), Inches(3.0), Inches(11), Inches(2.2),
    [[R("Um cérebro de IA, muitos corpos — a mesma inteligência em cada tela, "
        "operando com segurança para que cada profissional da setup.com.br "
        "entregue mais e melhor, com bem-estar.", 30, WHITE, bold=True)]],
    line_spacing=1.12)
txt(s, Inches(1.2), Inches(6.4), Inches(11), Inches(0.5),
    [[R("setup.com.br  ·  Infraestrutura de TI com IA", 13,
        RGBColor(0x8F, 0xA8, 0xC4))]])

prs.save(OUT)
print("Deck salvo em", OUT, "—", len(prs.slides._sldIdLst), "slides")
