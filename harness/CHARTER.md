# Charter do harness — setup.com.br

> Este é o **mapa**. Um agente lê o charter primeiro para saber **onde** mora cada
> tipo de conhecimento e só então **recupera a fonte profunda** que a tarefa
> exige. Não injete a empresa inteira em todo prompt: dê ao agente um ponto de
> entrada pequeno e estável, e o contexto profundo sob demanda. Assim a memória
> da empresa fica disponível sem gastar a janela de contexto antes do trabalho
> começar.

## Onde está cada coisa

| Preciso de… | Vá para |
|---|---|
| O que a empresa faz, como ganha dinheiro, o que importa agora | `companies/setup.com.br/company-brief.md` |
| Por que o time escolheu um caminho | `companies/setup.com.br/knowledge/decisions.md` |
| Como a empresa gosta de fazer as coisas | `companies/setup.com.br/knowledge/playbooks.md` |
| Compromissos, riscos, dúvidas e decisões de reuniões recentes | `companies/setup.com.br/sources/meetings/` |
| Estado atual de um projeto | `companies/setup.com.br/projects/` |
| Quem é dono de quê | `companies/setup.com.br/people/` |
| Como o trabalho deve ser conduzido (regras) | `companies/setup.com.br/policies/` |
| Um fluxo repetível pronto para rodar | `companies/setup.com.br/workers/` |

## Camada de ferramentas (conectores MCP já disponíveis)

O charter também roteia para **onde os fatos vivos são buscados** — os conectores
já descritos em `docs/infraestrutura-ia-setup.md`:

| Fonte viva | Conector MCP | Uso típico no harness |
|---|---|---|
| Conversas e grupos de WhatsApp | `whatsapp-business` (este repo) | capturar compromissos e sinais operacionais |
| E-mail | Gmail | acordos, decisões, follow-ups |
| Agenda / reuniões | Google Calendar | janela de reporte, próximos compromissos |
| Arquivos e documentos | Google Drive | propostas, contratos, atas |
| Código e entregas técnicas | GitHub | avanço de engenharia, PRs, CI |
| Operar a máquina | computer-use | runbooks, sistemas internos |

> Regra de recuperação: **traga só o que a tarefa pede.** O worker declara suas
> fontes permitidas; o agente segue esse escopo — não varre tudo.

## Ordem de leitura recomendada para um worker

1. `CHARTER.md` (este arquivo) — o mapa.
2. A **política** do worker (o que é permitido, invariantes).
3. O **worker** (a sequência repetível e o contrato de saída).
4. As **fontes permitidas** que o worker declara — recuperadas sob demanda.
