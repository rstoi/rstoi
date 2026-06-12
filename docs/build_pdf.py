#!/usr/bin/env python3
"""Gera o documento executivo em PDF (texto vetorial) com a marca setup.com.br.
Não depende de LibreOffice — usa o backend PDF do matplotlib."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, FancyBboxPatch
import matplotlib.image as mpimg

A = "/home/user/rstoi/docs/assets"
OUT = "/home/user/rstoi/docs/Infraestrutura-IA-setup.com.br.pdf"

# Paleta da marca
INK   = "#003C54"; BLUE = "#0E6E92"; TEAL = "#1F97B4"; STEEL = "#609CC0"
SLATE = "#5E6A72"; BODY = "#212B36"; GRAY = "#A8A8A8"
LIGHT = "#E4EEF4"; LIGHT2 = "#E1F0F4"; STEELT = "#EAF1F8"; GREY = "#F1F4F6"
WHITE = "#FFFFFF"

plt.rcParams["font.family"] = "DejaVu Sans"

PW, PH = 8.5, 11.0          # Letter
ML, MR, MT, MB = 0.9, 0.9, 0.95, 0.9
CW = PW - ML - MR           # largura de conteúdo

# Figura de medição (Agg) para calcular largura de texto
_mfig = plt.figure(figsize=(PW, PH), dpi=200)
_mr = _mfig.canvas.get_renderer()
def tw(s, fs, weight="normal"):
    t = _mfig.text(0, 0, s, fontsize=fs, fontweight=weight)
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

# ---- estado de paginação ----
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
    if not cover:
        pass

def _footer():
    # logo + linha + número
    try:
        logo = mpimg.imread(f"{A}/setup_logo@hi.png")
        ar = logo.shape[1] / logo.shape[0]
        h = 0.16; w = h * ar
        axl = fig.add_axes([xf(ML), yf(PH - MB + 0.42), w / PW, h / PH])
        axl.imshow(logo); axl.axis("off")
    except Exception:
        pass
    fig.text(xf(ML + 1.2), yf(PH - MB + 0.5),
             "·  Infraestrutura de TI com IA  ·  Documento Executivo",
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
             fontweight=weight, fontstyle=style, ha=ha, va="baseline")

# ---- blocos de conteúdo ----
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
    # quebrar considerando o prefixo em negrito na primeira linha
    lines = wrap(full, fs, "normal", CW - indent)
    for i, line in enumerate(lines):
        ensure(fs / 72 * 1.35)
        if first:
            put(ML + 0.04, y + fs / 72, "•", fs, BLUE, "bold")
            # desenhar prefixo bold + resto: aproximação — render prefix bold se a linha começa com ele
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
    # widths em frações de CW
    cw = [w * CW for w in widths]
    pad = 0.09
    def row_h(cells):
        mx = 1
        for c, w in zip(cells, cw):
            mx = max(mx, len(wrap(c, fs, "normal", w - 2 * pad)))
        return 0.1 + mx * (fs / 72 * 1.25) + 0.08
    # cabeçalho
    hh = row_h(headers)
    ensure(hh + 0.2)
    x = ML
    rect(ML, y, CW, hh, INK)
    for c, w in zip(headers, cw):
        put(x + pad, y + 0.20, c, fs, WHITE, "bold")
        x += w
    y += hh
    # linhas
    for r_i, cells in enumerate(rows):
        rh = row_h(cells)
        if y + rh > PH - MB:
            new_page()
            # repetir cabeçalho
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
put(PW / 2, y, "Arquitetura de produtividade aumentada por Inteligência Artificial",
    11.5, BODY, ha="center"); y += 0.28
put(PW / 2, y, "Integração PC · Notebook · Tablet · Smartphone · WhatsApp · Google Workspace",
    10, SLATE, style="italic", ha="center"); y += 0.6
# metadados
bw = 2.0; gapx = 0.15; total = bw * 3 + gapx * 2; x0 = ML + (CW - total) / 2
for k, v in [("VERSÃO", "1.0"), ("DATA", "Junho / 2026"), ("CLASSIFICAÇÃO", "Uso interno")]:
    rect(x0, y, bw, 0.6, LIGHT, rounded=True)
    put(x0 + bw / 2, y + 0.24, k, 8, SLATE, "bold", ha="center")
    put(x0 + bw / 2, y + 0.46, v, 11, INK, "bold", ha="center")
    x0 += bw + gapx

# =================================================================== 1 SUMÁRIO
new_page()
heading("", "Sumário Executivo")
paragraph("A setup.com.br adota uma infraestrutura de TI em que a Inteligência "
          "Artificial deixa de ser uma ferramenta avulsa e passa a ser uma camada "
          "transversal de trabalho. Cada profissional ganha um assistente único — "
          "acessível no notebook, no celular, no tablet e pelo WhatsApp — que entende "
          "o contexto da empresa e executa tarefas de ponta a ponta.")
paragraph("O diferencial não é “conversar com um chatbot”, e sim ter agentes que "
          "operam de verdade: leem e-mails, organizam a agenda, geram documentos, "
          "respondem clientes no WhatsApp e atuam sobre os sistemas internos já "
          "existentes (projetos, contratos e comercial) — sempre sob controle humano "
          "nas decisões críticas. Para isso combinamos três pilares:")
bullet("Multimodelo — ", "seleciona automaticamente o modelo certo para cada tarefa, equilibrando custo, velocidade e qualidade.")
bullet("Harness loop — ", "o ciclo planejar → agir → observar → corrigir que faz o agente concluir o trabalho sozinho.")
bullet("Conectores MCP — ", "um padrão único que conecta a IA aos sistemas reais (WhatsApp, Google Workspace, projetos, contratos e comercial).")
callout("Resultado esperado:  ",
        "menos tempo em tarefas repetitivas e mais qualidade nos entregáveis — e, "
        "no mesmo movimento, equipes menos sobrecarregadas, com mais segurança "
        "psicológica e melhores condições de trabalho, sob governança e custo controlados.")
image(f"{A}/01_camadas.png", 5.9, "Figura 1 — A infraestrutura em quatro camadas integradas.")

# =================================================================== 2 EXPERIÊNCIA
new_page()
heading("1", "Um assistente em cada tela")
paragraph("Independentemente do dispositivo, o profissional fala com o mesmo agente, "
          "que carrega o mesmo contexto. Pedir pelo WhatsApp “remarca a reunião com o "
          "cliente X para quinta” usa exatamente os mesmos conectores (Calendar + Gmail) "
          "que seriam usados no notebook.")
table(["Dispositivo", "Como é usado no dia a dia"],
      [["PC / Notebook", "Produção: documentos, planilhas, código, análise de dados e operação do computador (computer-use)."],
       ["Tablet", "Revisão, aprovação e leitura de resumos; ditado de tarefas em reunião ou em campo."],
       ["Smartphone", "Captura rápida (foto de nota fiscal, áudio), consulta de agenda e aprovação de ações."],
       ["WhatsApp", "Canal mais natural no Brasil: conversa por texto ou áudio; clientes também são atendidos por agentes."],
       ["Chat web / IDE", "Trabalho técnico e suporte: copiloto interno para as equipes."]],
      [0.26, 0.74])
paragraph("Ponto-chave: é o mesmo cérebro com o mesmo contexto em qualquer tela. O "
          "profissional escolhe o canal mais conveniente; a inteligência e os dados "
          "permanecem consistentes.", italic=True)

# =================================================================== 3 MULTIMODELO
heading("2", "Multimodelo — a IA certa para cada tarefa")
paragraph("Nem toda tarefa exige o modelo mais caro. Um roteador inteligente escolhe "
          "automaticamente entre modelos rápidos e econômicos para o volume do dia a dia "
          "e modelos de máxima capacidade para o trabalho complexo.")
image(f"{A}/03_modelos.png", 5.5, "Figura 2 — Roteamento por custo e capacidade.")
paragraph("Modelos especializados complementam o texto: transcrição de áudio (WhatsApp "
          "e reuniões), visão/OCR (notas e contratos escaneados) e busca semântica sobre "
          "a base de conhecimento da empresa.")

# =================================================================== 4 HARNESS LOOP
new_page()
heading("3", "Harness loop — de chatbot a agente que entrega")
paragraph("Um chatbot responde; um agente opera. O harness loop é o ciclo que permite "
          "ao agente concluir uma tarefa de ponta a ponta, corrigindo-se a cada passo.")
image(f"{A}/02_loop.png", 5.0, "Figura 3 — O ciclo planejar → agir → observar → refletir.")
subheading("Exemplo real — “Fechar proposta para o cliente X”")
bullet("Planejar — ", "o vendedor pede pelo WhatsApp; o agente entende o objetivo.")
bullet("Agir / Observar (loop) — ", "busca template e histórico no Drive, recupera o último acordo no Gmail, gera a proposta e agenda a apresentação no Calendar.")
bullet("Aprovação humana — ", "envia o resumo ao vendedor pelo WhatsApp; se ele pedir ajustes, o loop reabre e corrige.")
callout("Controle humano (human-in-the-loop):  ",
        "ações de baixo risco (rascunhar, resumir, buscar) são automáticas; ações "
        "externas ou irreversíveis (enviar e-mail ao cliente, apagar arquivo, alterar "
        "contrato) exigem aprovação explícita.", bg=STEELT)

# =================================================================== 5 AGENTES
new_page()
heading("4", "Catálogo de agentes especializados")
paragraph("Em vez de um único agente genérico, a empresa mantém agentes com escopos e "
          "permissões definidos. Cada um usa o harness loop e o roteamento multimodelo, "
          "e pode delegar a sub-agentes em paralelo.")
table(["Agente", "Função", "Conectores"],
      [["Assistente Executivo", "Triagem de e-mail, agenda, resumos diários, preparo de reuniões.", "Gmail, Calendar, Drive"],
       ["Atendimento / SDR", "Responde clientes no WhatsApp, qualifica leads, agenda demos.", "WhatsApp, Comercial"],
       ["PMO / Projetos", "Atualiza status, gera relatórios e antecipa riscos.", "Projetos, Drive"],
       ["Contratos", "Gera e acompanha prazos de contratos; OCR de documentos.", "Contratos, visão/OCR"],
       ["Suporte / Helpdesk", "Abre e resolve chamados, executa runbooks, opera máquinas.", "computer-use, ITSM"],
       ["DevOps / Engenharia", "Revisa PRs, corrige CI, evolui os sistemas internos.", "GitHub, computer-use"],
       ["Financeiro", "Concilia, organiza despesas e gera relatórios.", "Contratos, ERP"]],
      [0.24, 0.52, 0.24])

# =================================================================== 6 SISTEMAS INTERNOS
new_page()
heading("5", "Sistemas internos existentes — integrar e fortalecer")
paragraph("A setup.com.br já desenvolveu, de forma ágil (vibe coding), sistemas internos "
          "que sustentam a operação: gestão de projetos, gestão de contratos e a área "
          "comercial. A nova infraestrutura não os substitui — ela os encapsula como "
          "conectores e os coloca no alcance dos agentes.")
subheading("Integrar — esses sistemas viram conectores dos agentes")
bullet("Gestão de Projetos — ", "o agente de PMO lê e atualiza status, monta relatórios e antecipa riscos.")
bullet("Gestão de Contratos — ", "o agente de Contratos gera minutas, acompanha prazos e aciona renovações.")
bullet("Comercial — ", "o agente de Atendimento/SDR qualifica leads e move o funil no próprio sistema comercial.")
subheading("Fortalecer — a IA também cuida da saúde desses sistemas")
paragraph("Sistemas nascidos em vibe coding entregam valor rápido, mas tendem a acumular "
          "dívida técnica. O agente de DevOps ajuda a estabilizá-los — adicionando testes, "
          "revisando alterações e documentando — reduzindo retrabalho e tornando-os mais "
          "confiáveis. O investimento já feito é preservado e ampliado, não descartado.")

# =================================================================== 7 PESSOAS
new_page()
heading("6", "Pessoas no centro — clima, segurança psicológica e condições de trabalho")
paragraph("Tecnologia só compensa se melhora a vida de quem trabalha. O maior efeito desta "
          "infraestrutura não é a automação em si, mas o que ela faz pelas pessoas: tira o "
          "trabalho repetitivo e penoso e devolve tempo, energia e tranquilidade.")
image(f"{A}/06_pessoas.png", 5.9, "Figura 4 — Como a infraestrutura melhora as condições de trabalho.")
subheading("Melhores condições de trabalho")
bullet("Menos trabalho braçal — ", "a IA assume triagem de e-mail, atualização de status e montagem de documentos, reduzindo sobrecarga e horas extras.")
bullet("Flexibilidade — ", "o mesmo assistente no WhatsApp e no celular reduz a fricção e apoia o equilíbrio entre vida e trabalho.")
bullet("Apoio constante — ", "um mentor sempre disponível nivela o jogo: profissionais novos ou juniores entregam com mais confiança.")
subheading("Mais segurança psicológica")
bullet("Tirar dúvidas sem julgamento — ", "dá para perguntar à IA quantas vezes for preciso, sem o constrangimento de “perguntar besteira”.")
bullet("O erro fica no rascunho — ", "tudo passa por rascunho revisável e aprovação humana; erra-se no rascunho, não na frente do cliente.")
bullet("Aumenta, não vigia — ", "a IA aumenta as pessoas; não as vigia nem mede desempenho individual. O controle das decisões é sempre humano.")
callout("Efeito no clima:  ",
        "equipes menos sobrecarregadas e mais confiantes colaboram melhor, retêm talentos "
        "e atendem clientes com mais qualidade. A IA passa a ser vista como aliada do "
        "profissional — não como ameaça ao seu trabalho.")

# =================================================================== 8 GOVERNANÇA
new_page()
heading("7", "Segurança e governança — não-negociável")
paragraph("A produtividade só é sustentável com confiança. A infraestrutura aplica controle por padrão:")
bullet("Identidade única (SSO) — ", "login via Google Workspace; cada agente age como o usuário, herdando apenas as permissões que ele já tem.")
bullet("Permissões mínimas — ", "cada conector recebe somente os escopos necessários (ex.: Drive apenas nas pastas autorizadas).")
bullet("Aprovação de ações externas — ", "envios a clientes, exclusões e alterações irreversíveis passam por confirmação humana.")
bullet("Segredos protegidos — ", "chaves e tokens em cofre (Vault / Secret Manager), nunca no código.")
bullet("Auditoria completa — ", "cada passo do loop (ferramenta, parâmetros, resultado, aprovação) é registrado para conformidade.")
bullet("Isolamento de dados — ", "dados da empresa não treinam modelos públicos; ambientes com garantia de não retenção.")

# =================================================================== 9 BASE + ROADMAP
heading("8", "O que já existe e o que falta construir")
paragraph("Boa parte da fundação já está no ambiente atual da setup.com.br, o que reduz o tempo e o risco de implantação:")
subheading("Já disponível")
bullet("WhatsApp — ", "conector via automação de navegador (número pessoal) e API oficial para produção.")
bullet("Google Workspace — ", "Gmail, Calendar e Drive integrados como conectores MCP.")
bullet("Sistemas internos — ", "projetos, contratos e comercial, prontos para serem expostos como conectores.")
subheading("A construir")
bullet("", "roteador multimodelo, catálogo de agentes, memória de longo prazo (base de conhecimento) e a camada de governança/SSO corporativa.")

new_page()
heading("9", "Roadmap de implantação")
image(f"{A}/04_roadmap.png", 6.0, "Figura 5 — Implantação faseada, do alicerce à otimização contínua.")

# =================================================================== 10 INDICADORES
heading("10", "Indicadores de acompanhamento")
paragraph("O sucesso é medido por produtividade, qualidade e — em pé de igualdade — pelo "
          "bem-estar das equipes. Em vez de prometer números, definimos o que acompanhar: "
          "a linha de base é medida na própria operação e as metas saem dela.")
image(f"{A}/05_indicadores.png", 5.9, "Figura 6 — Domínios de indicadores; valores definidos a partir da medição inicial.")
frase("Em uma frase",
      "um cérebro de IA, muitos corpos — a mesma inteligência em cada tela, operando "
      "com segurança para que cada profissional da setup.com.br entregue mais e melhor.")

# finalizar
_footer(); pdf.savefig(fig); plt.close(fig)
pdf.close()
print("PDF do documento gerado:", OUT, "—", pageno, "páginas")
