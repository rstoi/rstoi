# Agente de Extratos — Banco do Brasil

Lê extratos mensais de **conta corrente do Banco do Brasil** (PDF), extrai os
lançamentos, **categoriza automaticamente** pela descrição (Histórico) e gera
um relatório financeiro consolidado.

Funciona com os dois layouts de extrato do BB (uma ou duas colunas de data) e
faz **fallback para OCR** (Tesseract) quando o PDF é digitalizado/sem camada de
texto.

## Instalação

```bash
pip install pypdfium2 Pillow pytesseract     # pytesseract só é necessário p/ OCR
# OCR (opcional, para PDFs digitalizados):
#   Debian/Ubuntu: sudo apt-get install tesseract-ocr tesseract-ocr-por
#   macOS:         brew install tesseract tesseract-lang
```

## Uso

```bash
python3 parse_extrato.py "BB 2024" "BB 2025" "BB 2026" --outdir output
# ou arquivos avulsos (PDF, OFX ou CSV):
python3 parse_extrato.py "BB 2025/MAIO 25.pdf" extrato.ofx extrato.csv --outdir output
```

Aceita **pastas** (varre `*.pdf`, `*.ofx`, `*.csv` recursivamente) ou arquivos
individuais. Pode misturar formatos no mesmo comando — todos entram no mesmo
relatório consolidado.

### Formatos de entrada

| Formato | Como é lido |
|---|---|
| **PDF** | Texto nativo (pypdfium2) e, se for digitalizado, OCR (Tesseract) |
| **OFX** | Exportação estruturada do BB (OFX 1.x/2.x); separa por mês automaticamente |
| **CSV** | Exportação do BB; delimitador `;`/`,` autodetectado; colunas mapeadas pelo cabeçalho |

> Sempre que possível, prefira **OFX ou CSV**: são estruturados, dispensam OCR e
> são mais confiáveis que o PDF.

## Multibanco (consolidação por conta)

Embora seja o "agente do BB", o leitor de OFX/CSV é agnóstico de banco — dá para
jogar extratos de **vários bancos** (ex.: BB + Itaú) no mesmo comando:

```bash
python3 parse_extrato.py "BB 2025" "BB 2026" extrato-itau.ofx --outdir output
```

O agente identifica o banco (código COMPE no OFX ou nome no PDF), **deduplica por
conta** (mesmo mês em bancos diferentes não some) e o `relatorio.md` traz:
**Resumo por banco/conta**, **fluxo de caixa mensal consolidado** (somando as
contas) e meses faltantes apurados por conta.

## Saídas (em `--outdir`, padrão `output/`)

| Arquivo | Conteúdo |
|---|---|
| `lancamentos.csv` | Um lançamento por linha: período, data, histórico, descrição, documento, valor (com sinal: + crédito / − débito), tipo, categoria, interno |
| `resumo.json` | Resumo por extrato (créditos, débitos, líquido) + bloco `qualidade_dados` |
| `relatorio.md` | Relatório consolidado: resumo geral, fluxo de caixa mensal, total por categoria e avisos de qualidade de dados |

## Categorias automáticas

Pix recebido/enviado · TED/Transferência · Ordem Bancária · Estornos ·
Financiamento (BB Giro / Pronampe / PEAC / FGI) · Consórcio · Cartão de crédito ·
Seguros · Câmbio · Tarifas bancárias · IOF · Juros · Impostos/Tributos · Outros.

As regras ficam em `CATEGORY_RULES` (`parse_extrato.py`) — uma lista ordenada de
`(regex, categoria, é_interno)`. É só editar/adicionar linhas para ajustar.

### Movimentações internas

Aplicações/resgates automáticos do **BB Rende Fácil** e as linhas de saldo são
marcadas como `interno=True` e **excluídas dos totais de fluxo de caixa** (são
varreduras internas de saldo, não entradas/saídas reais). Continuam disponíveis
no CSV, com a coluna `interno`.

## Qualidade dos dados

O período usado é sempre o **impresso dentro do PDF**, não o nome do arquivo.
Com isso o agente:

- **detecta arquivos com mês errado no nome** (período repetido) e os
  desconsidera dos totais, para não contar em dobro — escolhendo como canônico
  o arquivo cujo nome bate com o período;
- **aponta meses sem extrato** no intervalo coberto.

Esses avisos aparecem no fim do `relatorio.md` e no `qualidade_dados` do JSON.

## Baixar extratos do site do BB (semiautomático)

`bb_export.mjs` ajuda a **baixar** os extratos — para rodar **na sua máquina**,
não em ambientes remotos. Ele abre um navegador real, **você loga manualmente**
(o script nunca toca nas suas credenciais/token) e ele captura automaticamente
todo arquivo baixado (PDF/OFX/CSV/TXT), organizando numa pasta.

```bash
npm i playwright
npx playwright install chromium
node bb_export.mjs --out ./extratos --profile ./.bb-profile
# faça login + baixe os meses no navegador; depois:
python3 parse_extrato.py ./extratos --outdir output
```

O `--profile` mantém o **registro do dispositivo** entre execuções, reduzindo
pedidos de token. Login totalmente automático **não** é suportado de propósito:
o BB usa teclado virtual, token no app e reconhecimento de dispositivo —
automatizar isso seria frágil e inseguro. Para acesso 100% programático, o
caminho correto é **Open Finance** (agregadores como Pluggy/Belvo) ou a API
corporativa do BB Developers.

## Testes

```bash
python3 -m unittest test_parse_extrato -v
```

Os testes usam linhas/arquivos sintéticos (sem dados bancários reais).

## Privacidade

Extratos são dados financeiros sensíveis. Mantenha PDFs e a pasta `output/`
**fora do controle de versão** — o `.gitignore` deste diretório já ignora ambos.
