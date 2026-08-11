# Playbooks — setup.com.br

> Como a empresa gosta de fazer as coisas. Métodos repetíveis que ainda não viraram
> um worker formal. Quando um playbook estabiliza e passa a ser rodado por várias
> pessoas, promova-o a um worker em `workers/`.

## Roteamento multimodelo (regra prática)

Comece barato e escale só se necessário: **Haiku** classifica e tenta; se a
confiança for baixa ou a tarefa for crítica, escala para **Sonnet**; tarefas
explicitamente complexas (agente longo, código, análise jurídica/financeira) vão
direto para **Opus**.

## Human-in-the-loop

Ações de baixo risco (rascunhar, resumir, buscar) são automáticas. Ações
externas/irreversíveis (enviar e-mail ao cliente, apagar arquivo, mexer em
contrato, distribuir um brief) **exigem aprovação humana explícita**.

## Fechamento de proposta para cliente (exemplo de loop ponta a ponta)

1. Entender o pedido (frequentemente vindo do WhatsApp do vendedor).
2. `search_files` no Drive → template + histórico do cliente.
3. `search_threads` no Gmail → último acordo de preço.
4. Gerar a proposta (Sonnet/Opus) e `create_file` no Drive.
5. `suggest_time` + `create_event` no Calendar → reunião de apresentação.
6. `send_message` no WhatsApp → resumo + link para o vendedor **aprovar**.
7. Refletir: se o vendedor pedir ajuste, o loop reabre e reconfirma.

## Como capturar inteligência de reunião

Solte notas em `sources/meetings/` usando `sources/meetings/_template-reuniao.md`.
O que importa para o brief semanal: **decisões, compromissos (com dono e prazo),
riscos/bloqueios e dúvidas em aberto** — exatamente o que costuma não chegar a um
documento polido.
