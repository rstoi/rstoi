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
    (re.compile(r"^s a l d o|^saldo$"),             "Saldo final", True),
    (re.compile(r"rende facil"),                    "Rende Fácil (interno)", True),
    (re.compile(r"pix.*recebido"),                  "Pix recebido", False),
    (re.compile(r"pix.*enviado"),                   "Pix enviado", False),
    (re.compile(r"ordem bancaria"),                 "Ordem Bancária (recebida)", False),
    (re.compile(r"\bted\b|transfer"),               "TED/Transferência", False),
    (re.compile(r"estorno"),                        "Estornos", False),
    (re.compile(r"pronampe|bb giro|cap.* giro|capital giro|peac|amortiza|"
                r"\bfgi\b|ecg garantia|comissao flat"),
                                                    "Financiamento (Giro/Pronampe/PEAC)", False),
    (re.compile(r"consorcio"),                      "Consórcio", False),
    (re.compile(r"cartao|cartão"),                  "Cartão de crédito", False),
    (re.compile(r"seg cred|seguro|\bseg "),         "Seguros", False),
    (re.compile(r"cambio"),                         "Câmbio", False),
    (re.compile(r"tarifa"),                         "Tarifas bancárias", False),
    (re.compile(r"i\.?o\.?f|\biof\b|1\.0\.f"),      "IOF", False),
    (re.compile(r"juros"),                          "Juros", False),
    (re.compile(r"imposto|tribut|darf|\bdas\b"),    "Impostos/Tributos", False),
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
    saldo_anterior: float | None = None
    duplicado_de: str | None = None   # nome do arquivo canônico, se este for cópia
    transactions: list[Transaction] = field(default_factory=list)

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

    periodo, conta = "", ""
    for l in lines:
        m = PERIODO_RE.search(l)
        if m:
            periodo = f"{m.group(2)}-{m.group(1)}"
        m = CONTA_RE.search(l)
        if m and not conta:
            conta = m.group(1)
    # fallback: deduz período do nome do arquivo se não achou no texto
    if not periodo:
        periodo = _period_from_name(pdf_path.name)

    stmt = Statement(arquivo=pdf_path.name, periodo=periodo, conta=conta,
                     usou_ocr=used_ocr)

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
        categoria, interno = categorize(desc)

        if categoria == "Saldo anterior":
            stmt.saldo_anterior = signed
            continue
        if categoria == "Saldo final":
            continue

        stmt.transactions.append(Transaction(
            arquivo=pdf_path.name,
            periodo=periodo,
            data=m.group("d2") or m.group("d1"),
            historico_cod=m.group("hist"),
            descricao=desc,
            detalhe="",
            documento=documento,
            valor=round(signed, 2),
            tipo=dc,
            categoria=categoria,
            interno=interno,
        ))
    return stmt


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
# Saídas
# ---------------------------------------------------------------------------

def deduplicate(statements: list[Statement]) -> dict:
    """Marca extratos com período repetido como duplicados (não canônicos).

    Os extratos do BB carregam o período impresso no PDF; quando vários
    arquivos trazem o mesmo período (ex.: arquivo salvo com o mês errado),
    apenas o primeiro é considerado canônico para os totais consolidados.
    Retorna metadados de qualidade de dados (duplicados, meses faltantes).
    """
    def name_matches(s: Statement) -> int:
        # 0 = nome do arquivo bate com o período (preferido como canônico)
        return 0 if _period_from_name(s.arquivo) == s.periodo else 1

    by_period: dict[str, list[Statement]] = {}
    for s in sorted(statements, key=lambda x: (x.periodo, name_matches(x), x.arquivo)):
        by_period.setdefault(s.periodo, []).append(s)

    duplicates = []
    for periodo, group in by_period.items():
        canonical = group[0]
        for dup in group[1:]:
            dup.duplicado_de = canonical.arquivo
            duplicates.append({
                "periodo": periodo,
                "arquivo": dup.arquivo,
                "canonico": canonical.arquivo,
            })

    periods = sorted(p for p in by_period if re.fullmatch(r"\d{4}-\d{2}", p))
    missing: list[str] = []
    if periods:
        start, end = periods[0], periods[-1]
        sy, sm = map(int, start.split("-"))
        ey, em = map(int, end.split("-"))
        y, m = sy, sm
        while (y, m) <= (ey, em):
            key = f"{y:04d}-{m:02d}"
            if key not in by_period:
                missing.append(key)
            m += 1
            if m > 12:
                y, m = y + 1, 1
    return {"duplicados": duplicates, "meses_faltantes": missing}


def canonical(statements: list[Statement]) -> list[Statement]:
    return [s for s in statements if s.duplicado_de is None]


def collect_pdfs(paths: list[str]) -> list[Path]:
    out: list[Path] = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            out.extend(sorted(path.rglob("*.pdf")))
        elif path.suffix.lower() == ".pdf":
            out.append(path)
    return out


def write_csv(statements: list[Statement], path: Path) -> int:
    cols = ["arquivo", "periodo", "data", "historico_cod", "descricao",
            "documento", "valor", "tipo", "categoria", "interno"]
    n = 0
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for s in statements:
            for t in s.transactions:
                row = {k: v for k, v in asdict(t).items() if k in cols}
                w.writerow(row)
                n += 1
    return n


def write_summary_json(statements: list[Statement], dq: dict, path: Path) -> None:
    extratos = []
    for s in sorted(canonical(statements), key=lambda x: x.periodo):
        extratos.append({
            "arquivo": s.arquivo,
            "periodo": s.periodo,
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
    statements = sorted(canonical(statements), key=lambda x: x.periodo)
    all_tx = [t for s in statements for t in s.transactions]
    ext_tx = [t for t in all_tx if not t.interno]

    tot_cred = sum(t.valor for t in ext_tx if t.valor > 0)
    tot_deb = sum(-t.valor for t in ext_tx if t.valor < 0)

    lines: list[str] = []
    lines.append("# Banco do Brasil — Relatório consolidado de extratos\n")
    conta = next((s.conta for s in statements if s.conta), "—")
    lines.append(f"**Conta corrente:** {conta}  ")
    lines.append(f"**Extratos processados:** {len(statements)}  ")
    lines.append(f"**Lançamentos (excl. movimentações internas):** {len(ext_tx)}\n")

    lines.append("## Resumo geral\n")
    lines.append("| | Valor |")
    lines.append("|---|---:|")
    lines.append(f"| Total de entradas (créditos) | {_fmt(tot_cred)} |")
    lines.append(f"| Total de saídas (débitos) | {_fmt(tot_deb)} |")
    lines.append(f"| **Resultado líquido** | **{_fmt(tot_cred - tot_deb)}** |\n")

    lines.append("## Fluxo de caixa mensal\n")
    lines.append("| Período | Lançamentos | Entradas | Saídas | Líquido | OCR |")
    lines.append("|---|---:|---:|---:|---:|:--:|")
    for s in statements:
        ocr = "sim" if s.usou_ocr else ""
        lines.append(
            f"| {s.periodo} | {len(s.transactions)} | {_fmt(s.creditos)} | "
            f"{_fmt(s.debitos)} | {_fmt(s.liquido)} | {ocr} |"
        )

    lines.append("\n## Total por categoria\n")
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

    dups, missing = dq.get("duplicados", []), dq.get("meses_faltantes", [])
    if dups or missing:
        lines.append("## ⚠️ Qualidade dos dados\n")
        if dups:
            lines.append("**Arquivos com período duplicado** (provável nome de mês "
                         "errado — desconsiderados dos totais para não contar em "
                         "dobro):\n")
            lines.append("| Período | Arquivo duplicado | Considerado (canônico) |")
            lines.append("|---|---|---|")
            for d in dups:
                lines.append(f"| {d['periodo']} | {d['arquivo']} | {d['canonico']} |")
            lines.append("")
        if missing:
            lines.append(f"**Meses sem extrato no intervalo:** {', '.join(missing)}\n")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Agente de extratos do Banco do Brasil")
    ap.add_argument("paths", nargs="+", help="Pastas ou PDFs de extratos")
    ap.add_argument("--outdir", default="output", help="Diretório de saída")
    args = ap.parse_args(argv)

    pdfs = collect_pdfs(args.paths)
    if not pdfs:
        print("Nenhum PDF encontrado.", file=sys.stderr)
        return 1

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    statements: list[Statement] = []
    for pdf in pdfs:
        stmt = parse_statement(pdf)
        statements.append(stmt)
        flag = " [OCR]" if stmt.usou_ocr else ""
        print(f"  {stmt.periodo}  {pdf.name:30s} {len(stmt.transactions):3d} lançamentos{flag}")

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
