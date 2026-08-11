# Decisões — setup.com.br

> Preserva o **porquê**. Documentos polidos guardam o *quê*; este arquivo guarda a
> razão pela qual o time escolheu um caminho, para que ninguém a redescubra do
> zero. Uma decisão por bloco, mais recente no topo.

## Modelo de registro

```
### AAAA-MM-DD — <título curto da decisão>
- **Decisão:** o que foi decidido.
- **Porquê:** o problema e a razão da escolha.
- **Alternativas descartadas:** e por quê.
- **Dono:** quem decide/mantém.
- **Fonte:** reunião, thread, documento.
```

---

### 2026-08-11 — Provar o harness em um único fluxo antes de expandir
- **Decisão:** o primeiro fluxo compartilhado é o **brief semanal de inteligência**;
  só depois de provado o time expande para outros fluxos.
- **Porquê:** mapear a empresa inteira primeiro gera semanas de contexto
  organizado sem prova de que o harness melhora um único trabalho. Um fluxo que
  acontece toda semana, com fronteiras claras e resultado fácil de julgar, prova o
  sistema rápido.
- **Alternativas descartadas:** modelar todos os agentes do catálogo de uma vez —
  alto custo, baixa prova de valor.
- **Dono:** —
- **Fonte:** `harness/README.md`, `docs/infraestrutura-ia-setup.md`.

### 2026-08-11 — Encapsular os sistemas internos como conectores, não substituí-los
- **Decisão:** Gestão de Projetos, Gestão de Contratos e Comercial (nascidos em
  vibe coding) são **encapsulados como conectores MCP** e fortalecidos, não
  reescritos.
- **Porquê:** preserva e amplia o investimento já feito; a IA cuida da saúde
  desses sistemas (testes, revisão, documentação) reduzindo dívida técnica.
- **Alternativas descartadas:** reescrever do zero — descartaria valor entregue.
- **Dono:** agente de DevOps / Engenharia.
- **Fonte:** `docs/infraestrutura-ia-setup.md` §7.
