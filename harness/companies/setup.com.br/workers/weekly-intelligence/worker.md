# Worker — weekly-intelligence

**Nome:** weekly-intelligence
**Propósito:** produzir um brief semanal da empresa, **com fontes**, para revisão
humana.
**Política que rege:** [`../../policies/weekly-intelligence.md`](../../policies/weekly-intelligence.md)
**Contrato de saída:** [`output-template.md`](output-template.md)

Um job **estreito** de propósito. Um "analista geral da empresa" soa útil, mas é
difícil de testar e fácil de usar mal. Este worker tem inputs, saída e condições
de parada claros.

## Fontes permitidas (só estas)

- `company-brief.md`
- reuniões dos **últimos 7 dias** em `sources/meetings/`
- projetos atuais em `projects/`
- decisões e compromissos em `knowledge/decisions.md`

Conectores vivos (opcionais, quando disponíveis e dentro do escopo): Calendar
(janela de reporte e próximos compromissos), Gmail/Drive (acordos e documentos),
GitHub (avanço técnico), `whatsapp-business` (sinais operacionais dos grupos
autorizados). **Traga só o que a tarefa pede.**

## Procedimento

1. **Confirme a janela de reporte** (padrão: os últimos 7 dias até hoje).
2. **Recupere as fontes permitidas** (e só elas).
3. **Extraia** decisões, avanço, riscos e compromissos.
4. **Verifique** cada afirmação contra o material de origem.
5. **Sinalize** contradições, lacunas e informação velha.
6. **Escreva o brief** no formato de `output-template.md`.

## Saída exigida

- Resumo executivo
- Decisões tomadas
- Movimento por projeto
- Riscos e bloqueios
- Compromissos da próxima semana
- Dúvidas em aberto
- Lista de fontes

## Nunca

- inventar fatos que faltam
- ler o contexto de outra empresa
- expor segredos
- enviar ou publicar o brief

## Pronto quando

Toda afirmação está apoiada por uma fonte **ou** rotulada como incerta, e o
rascunho está pronto para revisão humana. **Pare aqui** — a distribuição é decisão
de um humano.

---

> O conhecimento da empresa fornece os fatos. A política fornece o julgamento.
> O worker fornece a **sequência repetível**. Um prompt produz um brief; o worker
> torna o método disponível para o próximo colega, na próxima sexta.
