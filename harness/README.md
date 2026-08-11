<img src="../docs/assets/setup_logo@hi.png" alt="setup.com.br" height="40">

# Harness compartilhado — setup.com.br

> Uma camada única onde **todos os agentes** (Claude Code, WhatsApp, Google
> Workspace, GitHub) encontram o **mesmo contexto, as mesmas regras e os mesmos
> fluxos de trabalho** da empresa — em vez de cada pessoa reensinar a IA do zero
> em cada conversa.

O modelo fornece a inteligência. **O harness fornece a empresa.** O mesmo modelo
"parece" outro entre duas empresas porque o ambiente de trabalho é outro: o que
ele sabe, como acha o contexto, quais regras segue, que trabalho repetível
executa e como cada execução melhora a próxima.

Este diretório é esse ambiente para a setup.com.br. Ele se apoia no que já existe
neste repositório — o MCP de WhatsApp, computer-use e os conectores de Google
Workspace/GitHub — e adiciona a **memória, as políticas e os workers** que
transformam ferramentas soltas em um sistema coordenado.

---

## As cinco perguntas que o harness responde

1. **O que a IA sabe?** → `companies/setup.com.br/` (brief, conhecimento, projetos, pessoas)
2. **Como ela acha o contexto certo?** → [`CHARTER.md`](CHARTER.md) (o mapa/roteamento)
3. **Quais regras ela deve seguir?** → `companies/setup.com.br/policies/`
4. **Que trabalho repetível ela executa?** → `companies/setup.com.br/workers/`
5. **Como cada execução melhora a próxima?** → o loop de revisão + sync (abaixo)

---

## Estrutura

```
harness/
├── CHARTER.md                         # o mapa: onde mora cada coisa (o agente lê isto primeiro)
└── companies/
    └── setup.com.br/
        ├── company-brief.md           # o que a empresa faz, como ganha dinheiro, o que importa agora
        ├── knowledge/
        │   ├── decisions.md           # decisões e o porquê (preserva o "porquê")
        │   └── playbooks.md           # como a empresa gosta de fazer as coisas
        ├── sources/
        │   └── meetings/              # inteligência de reuniões (compromissos, riscos, dúvidas)
        ├── signals/                   # sinais soltos (métricas, alertas) — opcional
        ├── people/                    # quem é dono do quê
        ├── projects/                  # estado atual dos projetos
        ├── policies/
        │   └── weekly-intelligence.md # como o trabalho deve ser conduzido
        └── workers/
            └── weekly-intelligence/   # worker reutilizável: brief semanal com fontes
```

> **Comece pequeno.** Só existe aqui o necessário para provar o harness em **um**
> fluxo real (o brief semanal de inteligência). Adicione conhecimento, políticas
> e workers mais profundos **quando um fluxo de trabalho real exigir** — nunca
> mapeie a empresa inteira antes de provar valor.

---

## O worker que prova o harness: **brief semanal de inteligência**

Um fluxo com as quatro propriedades certas para começar: **acontece toda semana**,
tem **fronteiras claras**, **depende de contexto da empresa** e o **resultado é
fácil de um humano julgar**.

- **O que ele produz:** um brief semanal com fontes — decisões tomadas, avanço
  por projeto, riscos e bloqueios, compromissos para a próxima semana, dúvidas em
  aberto e a lista de fontes.
- **A fronteira:** **só rascunho.** Ele **para para revisão humana** antes de
  qualquer distribuição.

### Como rodar

No Claude Code, dentro deste repositório:

```
/weekly-intelligence
```

(veja `.claude/commands/weekly-intelligence.md`). Ou, em qualquer ferramenta:
abra este repositório como diretório de trabalho e peça ao agente para *"seguir o
worker em `harness/companies/setup.com.br/workers/weekly-intelligence/worker.md`"*.

---

## Três níveis de controle

| Nível | O que é | Exemplo |
|---|---|---|
| **Instrução** | pedido pontual, vive só na conversa | "cite as fontes desta vez" |
| **Política** | regra durável, sobrevive a novas sessões e pessoas | `policies/weekly-intelligence.md` |
| **Hook / trava mecânica** | **bloqueia** a ação quando a falha custa caro | aprovação humana antes de enviar |

"Cite as fontes" pode começar como política. "Nunca envie sem aprovação" merece
ser travado na fronteira da ação (human-in-the-loop, como já descrito em
`docs/infraestrutura-ia-setup.md` §5).

---

## O loop que compõe (Memory → context → policy → worker → review → team default)

Não trate o primeiro run bem-sucedido como infraestrutura pronta. Rode, revise e
**conserte a camada certa** de cada correção:

| Sintoma | Camada a consertar |
|---|---|
| Fato faltando | melhore o **conhecimento** (`knowledge/`, `sources/`) |
| Contexto errado | melhore o **roteamento** (`CHARTER.md` e as descrições) |
| Erro repetido | melhore o **skill do worker** (`workers/.../worker.md`) |
| Comportamento inseguro | melhore a **política** ou o **hook** |
| Entregável fraco | melhore o **contrato de saída** (`output-template.md`) |
| Informação velha | melhore a **jardinagem do conhecimento** |

A pergunta útil não é "como reescrevo o prompt?", e sim **"qual parte do ambiente
deixou esse erro passar?"**. Conserte essa camada e rode o mesmo exemplo de novo.
A correção deve **sobreviver** ao output que a expôs.

Quando uma melhoria sobrevive à revisão, ela vira o **novo ponto de partida do
time**: a próxima pessoa herda contexto, regras, skills e workers já provados —
sem precisar do chat ou do prompt original.

---

## Fronteira e segurança do "compartilhado"

- **Isolamento por empresa.** Cada tenant vive sob `companies/<empresa>/`. Um
  worker **nunca** lê o contexto de outra empresa.
- **Sem segredos aqui.** Nada de tokens, chaves ou dados sensíveis nos arquivos
  compartilhados. Segredos ficam em `.env` (fora do git) e no vault.
- **Main é produção.** Aprendizado compartilhado eleva o risco: uma instrução
  fraca agora afeta todo mundo. Revise cada contribuição antes de promovê-la:
  políticas curtas, workers testados contra exemplos reais.
