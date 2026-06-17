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
# ou arquivos avulsos:
python3 parse_extrato.py "BB 2025/MAIO 25.pdf" --outdir output
```

Aceita pastas (varre `*.pdf` recursivamente) ou PDFs individuais.

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

## Testes

```bash
python3 -m unittest test_parse_extrato -v
```

Os testes usam linhas sintéticas (sem dados bancários reais).

## Privacidade

Extratos são dados financeiros sensíveis. Mantenha PDFs e a pasta `output/`
**fora do controle de versão** — o `.gitignore` deste diretório já ignora ambos.
