#!/usr/bin/env python3
"""Banco do Brasil — agente de extratos de conta corrente.

Lê extratos mensais de conta corrente do Banco do Brasil (PDF), extrai os
lançamentos, categoriza automaticamente pela descrição (Histórico) e gera:

  * CSV   com todos os lançamentos (uma linha por transação);
  * JSON  com o resumo de cada extrato (período, saldos, totais);
  * relatório consolidado em Markdown (fluxo de caixa mensal e por categoria).

PDFs com camada de texto são lidos diretamente (pypdfium2). PDFs digitalizados
(somente imagem) caem automaticamente para OCR via Tesseract, quando disponível.

Uso:
    python3 parse_extrato.py <pasta-ou-arquivos...> [--outdir DIR]

Exemplo:
    python3 parse_extrato.py "BB 2024" "BB 2025" "BB 2026" --outdir output
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

import pypdfium2 as pdfium

# ---------------------------------------------------------------------------
# Extração de texto (com fallback para OCR)
# ---------------------------------------------------------------------------

MONTHS_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril", 5: "maio", 6: "junho",
    7: "julho", 8: "agosto", 9: "setembro", 10: "outubro", 11: "novembro",
    12: "dezembro",
}


def _ocr_page(page) -> str:
    """Renderiza uma página e roda OCR (Tesseract, idioma português)."""
    try:
        import pytesseract  # noqa: WPS433 (import tardio: OCR é opcional)
    except ImportError:  # pragma: no cover - depende do ambiente
        return ""
    img = page.render(scale=3).to_pil()
    try:
        return pytesseract.image_to_string(img, lang="por")
    except pytesseract.TesseractError:  # pragma: no cover
        return pytesseract.image_to_string(img)


def extract_text(pdf_path: Path) -> tuple[str, bool]:
    """Retorna (texto, usou_ocr) de um extrato em PDF."""
    pdf = pdfium.PdfDocument(str(pdf_path))
    parts, used_ocr = [], False
    for page in pdf:
        text = page.get_textpage().get_text_range()
        if len(text.strip()) < 40:  # página sem camada de texto -> OCR
            ocr = _ocr_page(page)
            if ocr.strip():
                text, used_ocr = ocr, True
        parts.append(text)
    return "\n".join(parts), used_ocr


# ---------------------------------------------------------------------------
# Limpeza e parsing de linhas
# ---------------------------------------------------------------------------

# Artefatos comuns de OCR nos extratos do BB.
_OCR_FIXES = [
    (re.compile(r"\s*\|\s*"), " "),          # linhas verticais viram pipe
    (re.compile(r"(\d,\d{2})\s*€"), r"\1 C"),  # € é leitura errada de "C"
    (re.compile(r"(\d,\d{2})\s*([CD])\b"), r"\1 \2"),  # garante espaço antes de C/D
]

DATE = r"\d{2}/\d{2}/\d{4}"
# Linha de lançamento: data [data] agência(4) lote(5) histórico(3) resto...
TX_RE = re.compile(
    rf"^(?P<d1>{DATE})(?:\s+(?P<d2>{DATE}))?\s+"
    r"(?P<ag>\d{4})\s+(?P<lote>\d{5})\s+(?P<hist>\d{3})\s+(?P<rest>.+)$"
)
# Valor (e saldo opcional) ao final da linha: 1.234,56 C [9.999,99 D]
VAL_RE = re.compile(
    r"(?P<valor>\d[\d.]*,\d{2})\s+(?P<dc>[CD])"
    r"(?:\s+(?P<saldo>\d[\d.]*,\d{2})\s+(?P<sdc>[CD]))?\s*$"
)
# Documento: inteiro (com pontos de milhar) imediatamente antes do valor.
DOC_RE = re.compile(r"^(?P<desc>.*?)\s+(?P<doc>\d[\d.]*)\s*$")

PERIODO_RE = re.compile(r"Per[ií]odo do\s*extrato\s*(\d{2})\s*/\s*(\d{4})")
CONTA_RE = re.compile(r"Conta corrente\s*([\d\-]+)")


def clean_line(line: str) -> str:
    for pat, repl in _OCR_FIXES:
        line = pat.sub(repl, line)
    return line.strip()


def br_to_float(num: str) -> float:
    """'1.234.567,89' -> 1234567.89"""
    return float(num.replace(".", "").replace(",", "."))


# Código COMPE -> nome do banco (para identificar a origem em OFX/PDF)
BANK_BY_ID = {
    "001": "Banco do Brasil", "237": "Bradesco", "341": "Itaú",
    "104": "Caixa Econômica", "033": "Santander", "077": "Banco Inter",
    "260": "Nubank", "212": "Banco Original", "336": "C6 Bank",
    "748": "Sicredi", "756": "Sicoob", "041": "Banrisul", "070": "BRB",
}


def bank_name(bankid: str = "", text: str = "") -> str:
    """Nome do banco a partir do código COMPE (OFX) ou do texto (PDF)."""
    key = (bankid or "").lstrip("0").zfill(3)
    if key in BANK_BY_ID:
        return BANK_BY_ID[key]
    low = strip_accents(text)
    for name in BANK_BY_ID.values():
        if strip_accents(name) in low:
            return name
    return ""


def strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    ).lower()


# ---------------------------------------------------------------------------
# Categorização
# ---------------------------------------------------------------------------

# (regex sobre descrição sem acento/minúscula, categoria, é_interno)
CATEGORY_RULES: list[tuple[re.Pattern, str, bool]] = [
    (re.compile(r"saldo anterior"),                 "Saldo anterior", True),
    (re.compile(r"^s a l d o|^saldo$|saldo total|saldo dispon"), "Saldo final", True),
    (re.compile(r"rende facil"),                    "Rende Fácil (interno)", True),
    # rendimento pago (juros da aplicação) é receita; vem antes do sweep interno
    (re.compile(r"rendiment|\brend\b"),             "Rendimentos de aplicação", False),
    (re.compile(r"aplicacao aut|resgate aut|aplic aut"), "Aplicação automática (interno)", True),
    (re.compile(r"pix.*recebido"),                  "Pix recebido", False),
    (re.compile(r"pix.*enviado"),                   "Pix enviado", False),
    (re.compile(r"\btar |tarifa|cesta"),            "Tarifas bancárias", False),
    (re.compile(r"\bpix\b"),                        "Pix (outros)", False),
    (re.compile(r"ordem bancaria"),                 "Ordem Bancária (recebida)", False),
    (re.compile(r"\bted\b|\bdoc\b|transfer"),       "TED/Transferência", False),
    (re.compile(r"\btbi\b"),                        "Transferência interna (TBI)", False),
    (re.compile(r"estorno|devolucao"),              "Estornos", False),
    (re.compile(r"boleto"),                         "Boletos", False),
    (re.compile(r"sispag|salario|folha de pag"),    "Folha/Salários (Sispag)", False),
    (re.compile(r"^da |debito autom|deb autor|deb aut|debito direto"),
                                                    "Débito automático", False),
    (re.compile(r"pronampe|bb giro|cap.* giro|capital giro|parcela giro|\bgiro\b|"
                r"peac|amortiza|\bfgi\b|ecg garantia|comissao flat|emprestimo|financ"),
                                                    "Financiamento (Giro/Pronampe/PEAC)", False),
    (re.compile(r"consorcio"),                      "Consórcio", False),
    (re.compile(r"cartao|cartão"),                  "Cartão de crédito", False),
    (re.compile(r"seg cred|seguro|\bseg "),         "Seguros", False),
    (re.compile(r"cambio"),                         "Câmbio", False),
    (re.compile(r"i\.?o\.?f|\biof\b|1\.0\.f"),      "IOF", False),
    (re.compile(r"juros"),                          "Juros", False),
    (re.compile(r"imposto|tribut|\btrib\b|darf|\bdas\b|fgts|inss|gps"),
                                                    "Impostos/Tributos", False),
]


def categorize(description: str) -> tuple[str, bool]:
    norm = strip_accents(description)
    for pat, cat, internal in CATEGORY_RULES:
        if pat.search(norm):
            return cat, internal
    return "Outros", False


# ---------------------------------------------------------------------------
# Modelo de dados
# ---------------------------------------------------------------------------

@dataclass
class Transaction:
    arquivo: str
    periodo: str          # AAAA-MM
    data: str             # DD/MM/AAAA (data de movimento)
    historico_cod: str
    descricao: str
    detalhe: str
    documento: str
    valor: float          # com sinal: + crédito, - débito
    tipo: str             # C ou D
    categoria: str
    interno: bool


@dataclass
class Statement:
    arquivo: str
    periodo: str
    conta: str
    usou_ocr: bool
    banco: str = ""
    saldo_anterior: float | None = None
    duplicado_de: str | None = None   # nome do arquivo canônico, se este for cópia
    transactions: list[Transaction] = field(default_factory=list)

    @property
    def chave_conta(self) -> str:
        """Identifica a conta (banco + número) para consolidação multibanco."""
        return f"{self.banco or '?'} · {self.conta or '?'}"

    @property
    def creditos(self) -> float:
        return sum(t.valor for t in self.transactions if t.valor > 0 and not t.interno)

    @property
    def debitos(self) -> float:
        return sum(-t.valor for t in self.transactions if t.valor < 0 and not t.interno)

    @property
    def liquido(self) -> float:
        return self.creditos - self.debitos


# ---------------------------------------------------------------------------
# Parser de um extrato
# ---------------------------------------------------------------------------

def parse_statement(pdf_path: Path) -> Statement:
    raw, used_ocr = extract_text(pdf_path)
    lines = [clean_line(l) for l in raw.splitlines() if l.strip()]

    periodo = ""
    for l in lines:
        m = PERIODO_RE.search(l)
        if m:
            periodo = f"{m.group(2)}-{m.group(1)}"
    # fallback: deduz período do nome do arquivo se não achou no texto
    if not periodo:
        periodo = _period_from_name(pdf_path.name)

    # conta: rótulo "Conta corrente NNNNN-N"; se o OCR separou rótulo e número,
    # cai para o primeiro número no formato de conta (5–8 dígitos + dígito).
    cm = CONTA_RE.search(raw)
    conta = cm.group(1) if cm else ""
    if not conta or "-" not in conta:
        am = re.search(r"(?<!\d)(\d{5,8}-\d)(?!\d)", raw)
        if am:
            conta = am.group(1)

    stmt = Statement(arquivo=pdf_path.name, periodo=periodo, conta=conta,
                     usou_ocr=used_ocr,
                     banco=bank_name(text=raw) or "Banco do Brasil")

    for l in lines:
        m = TX_RE.match(l)
        if not m:
            continue
        rest = m.group("rest")
        vm = VAL_RE.search(rest)
        if not vm:
            continue
        head = rest[: vm.start()].strip()
        dm = DOC_RE.match(head)
        if dm:
            desc, documento = dm.group("desc").strip(), dm.group("doc")
        else:
            desc, documento = head, ""

        dc = vm.group("dc")
        valor = br_to_float(vm.group("valor"))
        signed = valor if dc == "C" else -valor

        if categorize(desc)[0] == "Saldo anterior":
            stmt.saldo_anterior = signed
            continue
        tx = make_transaction(pdf_path.name, periodo, m.group("d2") or m.group("d1"),
                              m.group("hist"), desc, documento, signed, dc)
        if tx:
            stmt.transactions.append(tx)
    return stmt


def make_transaction(arquivo: str, periodo: str, data: str, hist: str, desc: str,
                     documento: str, signed: float, dc: str) -> Transaction | None:
    """Cria um lançamento já categorizado, ou None para linhas de saldo."""
    categoria, interno = categorize(desc)
    if categoria in ("Saldo anterior", "Saldo final"):
        return None
    return Transaction(
        arquivo=arquivo, periodo=periodo, data=data, historico_cod=hist,
        descricao=desc.strip(), detalhe="", documento=documento,
        valor=round(signed, 2), tipo=dc, categoria=categoria, interno=interno,
    )


def _period_from_name(name: str) -> str:
    n = strip_accents(name)
    year = None
    ym = re.search(r"\b20(\d{2})\b", n) or re.search(r"\b(\d{2})\b", n)
    if ym:
        y = ym.group(0)
        year = y if len(y) == 4 else f"20{y}"
    months = {
        "jan": "01", "fev": "02", "mar": "03", "abr": "04", "mai": "05",
        "jun": "06", "jul": "07", "ago": "08", "set": "09", "out": "10",
        "nov": "11", "dez": "12",
    }
    mon = next((v for k, v in months.items() if k in n), "00")
    return f"{year or '????'}-{mon}"


# ---------------------------------------------------------------------------
# Importadores OFX / CSV (exportações estruturadas do BB)
# ---------------------------------------------------------------------------

def _read_text(path: Path) -> str:
    """Lê texto tentando UTF-8 e caindo para latin-1 (comum em OFX/CSV do BB)."""
    data = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="ignore")


def _month_key(data_ddmmyyyy: str) -> str:
    d, m, y = data_ddmmyyyy.split("/")
    return f"{y}-{m}"


def _norm_date(s: str) -> str:
    """Normaliza datas para DD/MM/AAAA (aceita ano com 2 dígitos)."""
    s = s.strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{2,4})", s)
    if not m:
        return s
    d, mo, y = m.groups()
    if len(y) == 2:
        y = "20" + y
    return f"{d}/{mo}/{y}"


def _group_by_month(txs: list[Transaction], arquivo: str, conta: str,
                    banco: str = "") -> list[Statement]:
    stmts: dict[str, Statement] = {}
    for t in txs:
        s = stmts.get(t.periodo)
        if s is None:
            s = Statement(arquivo=arquivo, periodo=t.periodo, conta=conta,
                          usou_ocr=False, banco=banco)
            stmts[t.periodo] = s
        s.transactions.append(t)
    return [stmts[k] for k in sorted(stmts)]


def _ofx_tag(block: str, tag: str) -> str:
    m = re.search(rf"<{tag}>([^<\r\n]+)", block, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _ofx_amount(s: str) -> float:
    s = s.strip()
    if "," in s and "." not in s:   # alguns bancos usam vírgula decimal no OFX
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def parse_ofx(path: Path) -> list[Statement]:
    """Lê um arquivo OFX (Money 2000 / OFX 1.x ou 2.x) do BB."""
    content = _read_text(path)
    conta = _ofx_tag(content, "ACCTID")
    banco = bank_name(_ofx_tag(content, "BANKID"))
    txs: list[Transaction] = []
    for block in content.split("<STMTTRN>")[1:]:
        dt = _ofx_tag(block, "DTPOSTED")[:8]
        amt = _ofx_tag(block, "TRNAMT")
        if len(dt) != 8 or not amt:
            continue
        data = f"{dt[6:8]}/{dt[4:6]}/{dt[0:4]}"
        signed = _ofx_amount(amt)
        desc = _ofx_tag(block, "MEMO") or _ofx_tag(block, "NAME")
        doc = _ofx_tag(block, "CHECKNUM") or _ofx_tag(block, "FITID")
        tx = make_transaction(path.name, _month_key(data), data, "", desc, doc,
                              signed, "C" if signed >= 0 else "D")
        if tx:
            txs.append(tx)
    return _group_by_month(txs, path.name, conta, banco)


# rótulos de coluna (sem acento/minúsculo) procurados no cabeçalho do CSV
_CSV_COLS = {
    "data": ("data lancamento", "data do lancamento", "data"),
    "desc": ("historico", "lancamento", "descricao", "detalhe", "historico/descricao"),
    "valor": ("valor", "valor (r$)", "valor r$"),
    "tipo": ("tipo lancamento", "tipo de lancamento", "tipo", "debito/credito"),
    "doc": ("numero do documento", "n documento", "documento", "n do documento"),
}


def _find_col(header: list[str], names: tuple[str, ...]) -> int:
    norm = [strip_accents(h).strip() for h in header]
    for n in names:
        if n in norm:
            return norm.index(n)
    # match parcial
    for i, h in enumerate(norm):
        if any(n in h for n in names):
            return i
    return -1


def _csv_value(value_str: str, tipo_str: str) -> tuple[float, str]:
    s = value_str.strip()
    tip = strip_accents(tipo_str)
    neg = (s.startswith("-") or s.rstrip().endswith("D") or "deb" in tip
           or tip.strip() == "d")
    s = s.lstrip("-").rstrip("CDcd ").strip()
    v = br_to_float(s) if s else 0.0
    return (-v if neg else v), ("D" if neg else "C")


def parse_csv(path: Path) -> list[Statement]:
    """Lê um CSV de extrato do BB (delimitador ; ou , autodetectado)."""
    import csv as _csv
    text = _read_text(path)
    rows = list(_csv.reader(text.splitlines(),
                            delimiter=";" if text.count(";") >= text.count(",") else ","))
    # localiza a linha de cabeçalho (contém "Data" e "Valor")
    hidx = next((i for i, r in enumerate(rows)
                 if _find_col(r, _CSV_COLS["data"]) >= 0
                 and _find_col(r, _CSV_COLS["valor"]) >= 0), -1)
    if hidx < 0:
        return []
    header = rows[hidx]
    c = {k: _find_col(header, v) for k, v in _CSV_COLS.items()}
    conta = ""
    cm = next((CONTA_RE.search(ln) for ln in text.splitlines() if CONTA_RE.search(ln)), None)
    if cm:
        conta = cm.group(1)
    txs: list[Transaction] = []
    for r in rows[hidx + 1:]:
        if c["data"] >= len(r) or c["valor"] >= len(r):
            continue
        data = _norm_date(r[c["data"]])
        if not re.match(r"\d{2}/\d{2}/\d{4}", data):
            continue
        tipo = r[c["tipo"]] if 0 <= c["tipo"] < len(r) else ""
        signed, dc = _csv_value(r[c["valor"]], tipo)
        desc = r[c["desc"]] if 0 <= c["desc"] < len(r) else ""
        doc = r[c["doc"]] if 0 <= c["doc"] < len(r) else ""
        tx = make_transaction(path.name, _month_key(data), data, "", desc, doc,
                              signed, dc)
        if tx:
            txs.append(tx)
    return _group_by_month(txs, path.name, conta, bank_name(text=text))


def load_source(path: Path) -> list[Statement]:
    """Carrega um extrato a partir de PDF, OFX ou CSV."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return [parse_statement(path)]
    if suffix == ".ofx":
        return parse_ofx(path)
    if suffix == ".csv":
        return parse_csv(path)
    return []


# ---------------------------------------------------------------------------
# Saídas
# ---------------------------------------------------------------------------

def _months_between(periods: list[str]) -> list[str]:
    periods = sorted(p for p in periods if re.fullmatch(r"\d{4}-\d{2}", p))
    if not periods:
        return []
    sy, sm = map(int, periods[0].split("-"))
    ey, em = map(int, periods[-1].split("-"))
    out, y, m = [], sy, sm
    have = set(periods)
    while (y, m) <= (ey, em):
        key = f"{y:04d}-{m:02d}"
        if key not in have:
            out.append(key)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def deduplicate(statements: list[Statement]) -> dict:
    """Marca extratos repetidos (mesma conta e período) como não canônicos.

    A dedupe é feita por **conta** (banco + número), de modo que o mesmo mês
    em contas diferentes (ex.: BB e Itaú em 2026-05) é preservado. Dentro de
    uma conta, períodos repetidos costumam indicar arquivo salvo com o mês
    errado; apenas um é considerado canônico. Os meses faltantes são apurados
    por conta. Retorna metadados de qualidade de dados.
    """
    def name_matches(s: Statement) -> int:
        # 0 = nome do arquivo bate com o período (preferido como canônico)
        return 0 if _period_from_name(s.arquivo) == s.periodo else 1

    by_acct_period: dict[tuple[str, str], list[Statement]] = {}
    for s in sorted(statements, key=lambda x: (x.chave_conta, x.periodo,
                                               name_matches(x), x.arquivo)):
        by_acct_period.setdefault((s.chave_conta, s.periodo), []).append(s)

    duplicates = []
    for (conta, periodo), group in by_acct_period.items():
        canon_stmt = group[0]
        for dup in group[1:]:
            dup.duplicado_de = canon_stmt.arquivo
            duplicates.append({
                "conta": conta, "periodo": periodo,
                "arquivo": dup.arquivo, "canonico": canon_stmt.arquivo,
            })

    # meses faltantes por conta
    by_acct: dict[str, list[str]] = {}
    for s in canonical(statements):
        by_acct.setdefault(s.chave_conta, []).append(s.periodo)
    missing_by_acct = {c: _months_between(ps) for c, ps in by_acct.items()}
    missing_by_acct = {c: ms for c, ms in missing_by_acct.items() if ms}
    # lista achatada (compatibilidade) — todos os meses faltantes
    missing = sorted({m for ms in missing_by_acct.values() for m in ms})
    return {"duplicados": duplicates, "meses_faltantes": missing,
            "meses_faltantes_por_conta": missing_by_acct}


def canonical(statements: list[Statement]) -> list[Statement]:
    return [s for s in statements if s.duplicado_de is None]


SUPPORTED = (".pdf", ".ofx", ".csv")


def collect_sources(paths: list[str]) -> list[Path]:
    out: list[Path] = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            for ext in SUPPORTED:
                out.extend(path.rglob(f"*{ext}"))
        elif path.suffix.lower() in SUPPORTED:
            out.append(path)
    return sorted(out)


def write_csv(statements: list[Statement], path: Path) -> int:
    cols = ["banco", "conta", "arquivo", "periodo", "data", "historico_cod",
            "descricao", "documento", "valor", "tipo", "categoria", "interno"]
    tx_cols = [c for c in cols if c not in ("banco", "conta")]
    n = 0
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for s in statements:
            for t in s.transactions:
                row = {k: v for k, v in asdict(t).items() if k in tx_cols}
                row["banco"], row["conta"] = s.banco, s.conta
                w.writerow(row)
                n += 1
    return n


def write_summary_json(statements: list[Statement], dq: dict, path: Path) -> None:
    extratos = []
    for s in sorted(canonical(statements), key=lambda x: x.periodo):
        extratos.append({
            "arquivo": s.arquivo,
            "periodo": s.periodo,
            "banco": s.banco,
            "conta": s.conta,
            "usou_ocr": s.usou_ocr,
            "lancamentos": len(s.transactions),
            "creditos": round(s.creditos, 2),
            "debitos": round(s.debitos, 2),
            "liquido": round(s.liquido, 2),
        })
    payload = {"extratos": extratos, "qualidade_dados": dq}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _fmt(v: float) -> str:
    s = f"{v:,.2f}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def write_report(statements: list[Statement], dq: dict, path: Path) -> None:
    statements = sorted(canonical(statements), key=lambda x: (x.chave_conta, x.periodo))
    all_tx = [t for s in statements for t in s.transactions]
    ext_tx = [t for t in all_tx if not t.interno]

    tot_cred = sum(t.valor for t in ext_tx if t.valor > 0)
    tot_deb = sum(-t.valor for t in ext_tx if t.valor < 0)

    # agrupa extratos por conta
    contas: dict[str, list[Statement]] = {}
    for s in statements:
        contas.setdefault(s.chave_conta, []).append(s)

    lines: list[str] = []
    lines.append("# Relatório consolidado de extratos bancários\n")
    lines.append(f"**Contas:** {len(contas)}  ")
    lines.append(f"**Extratos processados:** {len(statements)}  ")
    lines.append(f"**Lançamentos (excl. movimentações internas):** {len(ext_tx)}\n")

    lines.append("## Resumo geral (consolidado)\n")
    lines.append("| | Valor |")
    lines.append("|---|---:|")
    lines.append(f"| Total de entradas (créditos) | {_fmt(tot_cred)} |")
    lines.append(f"| Total de saídas (débitos) | {_fmt(tot_deb)} |")
    lines.append(f"| **Resultado líquido** | **{_fmt(tot_cred - tot_deb)}** |\n")

    lines.append("## Resumo por banco / conta\n")
    lines.append("| Banco · Conta | Período | Extratos | Entradas | Saídas | Líquido |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for chave, group in sorted(contas.items()):
        pers = sorted(s.periodo for s in group)
        cred = sum(s.creditos for s in group)
        deb = sum(s.debitos for s in group)
        cobertura = f"{pers[0]} … {pers[-1]}" if pers else "—"
        lines.append(f"| {chave} | {cobertura} | {len(group)} | "
                     f"{_fmt(cred)} | {_fmt(deb)} | {_fmt(cred - deb)} |")
    lines.append("")

    lines.append("## Fluxo de caixa mensal (consolidado)\n")
    lines.append("| Período | Contas | Lançamentos | Entradas | Saídas | Líquido |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    by_month: dict[str, list[Statement]] = {}
    for s in statements:
        by_month.setdefault(s.periodo, []).append(s)
    for periodo in sorted(by_month):
        grp = by_month[periodo]
        cred = sum(s.creditos for s in grp)
        deb = sum(s.debitos for s in grp)
        nlan = sum(len(s.transactions) for s in grp)
        lines.append(f"| {periodo} | {len(grp)} | {nlan} | "
                     f"{_fmt(cred)} | {_fmt(deb)} | {_fmt(cred - deb)} |")

    lines.append("\n## Total por categoria (consolidado)\n")
    cats: dict[str, dict[str, float]] = {}
    for t in ext_tx:
        c = cats.setdefault(t.categoria, {"in": 0.0, "out": 0.0, "n": 0})
        if t.valor > 0:
            c["in"] += t.valor
        else:
            c["out"] += -t.valor
        c["n"] += 1
    lines.append("| Categoria | Lançamentos | Entradas | Saídas | Líquido |")
    lines.append("|---|---:|---:|---:|---:|")
    for cat, c in sorted(cats.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"])):
        liq = c["in"] - c["out"]
        lines.append(
            f"| {cat} | {int(c['n'])} | {_fmt(c['in'])} | {_fmt(c['out'])} | {_fmt(liq)} |"
        )

    lines.append("\n> Movimentações \"Rende Fácil\" (aplicação/resgate automático) e "
                 "linhas de saldo são tratadas como internas e excluídas dos totais "
                 "de fluxo de caixa.\n")

    dups = dq.get("duplicados", [])
    missing_acct = dq.get("meses_faltantes_por_conta", {})
    if dups or missing_acct:
        lines.append("## ⚠️ Qualidade dos dados\n")
        if dups:
            lines.append("**Arquivos com período duplicado na mesma conta** (provável "
                         "nome de mês errado — desconsiderados dos totais para não "
                         "contar em dobro):\n")
            lines.append("| Conta | Período | Arquivo duplicado | Considerado (canônico) |")
            lines.append("|---|---|---|---|")
            for d in dups:
                lines.append(f"| {d.get('conta','—')} | {d['periodo']} | "
                             f"{d['arquivo']} | {d['canonico']} |")
            lines.append("")
        if missing_acct:
            lines.append("**Meses sem extrato (por conta):**\n")
            for conta, ms in sorted(missing_acct.items()):
                lines.append(f"- {conta}: {', '.join(ms)}")
            lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Agente de extratos bancários (BB, Itaú e outros) — PDF/OFX/CSV")
    ap.add_argument("paths", nargs="+", help="Pastas ou arquivos (PDF/OFX/CSV)")
    ap.add_argument("--outdir", default="output", help="Diretório de saída")
    args = ap.parse_args(argv)

    sources = collect_sources(args.paths)
    if not sources:
        print("Nenhum extrato (.pdf/.ofx/.csv) encontrado.", file=sys.stderr)
        return 1

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    statements: list[Statement] = []
    for src in sources:
        for stmt in load_source(src):
            statements.append(stmt)
            flag = " [OCR]" if stmt.usou_ocr else f" [{src.suffix.lstrip('.').upper()}]"
            print(f"  {stmt.periodo}  {src.name:30s} "
                  f"{len(stmt.transactions):3d} lançamentos{flag}")

    dq = deduplicate(statements)
    canon = canonical(statements)

    n = write_csv(canon, outdir / "lancamentos.csv")
    write_summary_json(statements, dq, outdir / "resumo.json")
    write_report(statements, dq, outdir / "relatorio.md")

    print(f"\n{len(canon)} extratos únicos ({len(statements)} arquivos) · {n} lançamentos")
    if dq["duplicados"]:
        print(f"⚠️  {len(dq['duplicados'])} arquivo(s) com período duplicado "
              "(desconsiderados): " +
              ", ".join(d["arquivo"] for d in dq["duplicados"]))
    if dq["meses_faltantes"]:
        print("⚠️  Meses sem extrato: " + ", ".join(dq["meses_faltantes"]))
    print(f"Saídas em: {outdir}/lancamentos.csv, resumo.json, relatorio.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
