# Agent Phone Bridge — Proposta de Arquitetura Alternativa

> **Autor:** Renato Toi
> **Documento técnico de design**

---

## 1. Contexto e motivação

A análise do projeto phone-harness (ShawnPana) identificou um padrão funcional
válido — controlar um iPhone real a partir de um agente LLM via macOS iPhone
Mirroring, sem jailbreak — mas com quatro lacunas estruturais:

| # | Lacuna identificada | Efeito |
|---|---|---|
| 1 | Consentimento imposto apenas por instrução em linguagem natural (prompt) | Nenhuma barreira técnica impede ação irreversível se o agente "decidir" ignorar a instrução |
| 2 | Texto capturado por OCR tratado como dado confiável | Vetor de prompt injection: qualquer texto na tela (notificação, mensagem, página web) pode ser interpretado como comando |
| 3 | Ausência de trilha de auditoria persistente | Impossível reconstruir "o que o agente fez" após o fato — não há DOM, e as capturas não são retidas |
| 4 | Ausência de granularidade de permissão por categoria de app/ação | Tudo ou nada: o mesmo canal de controle acessa Mensagens, banco, Fotos e Configurações |

O objetivo desta proposta não é reescrever o transporte (captura de tela +
CGEvents via iPhone Mirroring segue sendo a base tecnicamente mais viável sem
jailbreak), mas envolver esse transporte em uma camada de governança que hoje
não existe em nenhum harness público conhecido para este caso de uso.

---

## 2. Princípio de design central

**Separação de planos: percepção, decisão e execução nunca devem ser o mesmo
processo com os mesmos privilégios.**

Isso segue um princípio já consolidado em segurança de sistemas (privilege
separation) e replicado em frameworks recentes de agentes com acesso a
ambientes reais (ex.: sandboxing de agentes de navegador, políticas de
"human-in-the-loop" em RPA corporativo). O phone-harness atual não separa esses
planos: o mesmo processo Python que lê a tela também decide a próxima ação e a
executa, sem intermediário.

---

## 3. Arquitetura proposta

```
┌─────────────┐     texto OCR       ┌──────────────────┐
│  Camada de  │  (marcado como      │   Agente LLM      │
│  Percepção  │───DADO NÃO CONFIÁVEL─▶  (planejamento)   │
│  (OCR/img)  │                     └────────┬──────────┘
└─────────────┘                              │ ação proposta
                                              ▼
                                   ┌─────────────────────┐
                                   │  Broker de Política   │
                                   │  (processo separado)  │
                                   │  - allowlist de apps   │
                                   │  - classificação de risco│
                                   │  - rate limit           │
                                   └────────┬────────────┘
                          bloqueia ◀────────┼────────▶ aprova
                                              │
                       ┌──────────────────────┴───────────────┐
                       ▼                                        ▼
              ação de baixo risco                    ação de alto risco
              (navegar, ler, abrir app)               (enviar, comprar,
              → executa direto                          apagar, config.)
                                                        → exige confirmação
                                                          fora de banda (push/
                                                          Slack/2ª tela)
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Camada de Execução   │
                                   │  (CGEvents/HID)        │
                                   └────────┬────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Registro de Auditoria │
                                   │  (append-only log +    │
                                   │   screenshot por ação) │
                                   └─────────────────────┘
```

### 3.1 Camada de Percepção
- Mantém OCR via Vision framework (mesma técnica validada no projeto original —
  é a solução correta dado que a janela de mirroring não expõe accessibility
  tree).
- **Correção principal:** todo texto extraído da tela é encapsulado com uma tag
  de proveniência (`<screen_content untrusted="true">`) antes de chegar ao
  contexto do LLM. O prompt do sistema do agente instrui explicitamente que
  texto dentro dessa tag é dado observado, nunca instrução — mesmo padrão que se
  aplica hoje a resultados de busca web ou conteúdo de documentos de terceiros
  em agentes bem projetados.
- Adição: um classificador leve (regras + heurística, não precisa ser LLM) varre
  o texto OCR em busca de padrões de injeção conhecidos (ex.: "ignore previous
  instructions", imperativos de segunda pessoa fora de contexto de app) e
  sinaliza para revisão antes de permitir que influencie o próximo passo do
  agente.

### 3.2 Broker de Política (novo componente — não existe no projeto original)
- Processo separado do agente, sem acesso ao raciocínio do LLM, apenas à ação
  estruturada proposta (ex.:
  `{"action": "tap_text", "target": "Enviar", "app_context": "Mensagens"}`).
- Mantém três listas configuráveis pelo usuário, fora do alcance do agente:
  - **Allowlist de apps** de baixo risco (Notas, Clima, Calculadora) — ação
    livre.
  - **Denylist de apps** sensíveis (Banco, Mensagens, Mail, Configurações, apps
    de pagamento) — qualquer ação de escrita exige confirmação fora de banda.
  - **Lista de verbos de alto risco** (enviar, comprar, excluir, confirmar,
    pagar, transferir) — gatilho de confirmação independente do app.
- Confirmação fora de banda: notificação push, mensagem em canal separado (ex.:
  Slack/Telegram) ou segunda tela — nunca uma pergunta que o próprio agente
  decide se faz ou não. Isso elimina a dependência de o LLM "lembrar" de
  perguntar.
- Rate limiting por sessão (ex.: máximo de N ações de escrita por minuto) para
  conter loops ou comportamento descontrolado.

### 3.3 Camada de Execução
- Reaproveita a técnica validada: CGEvents no nível HID, foco de janela
  obrigatório antes de cada evento, sem cache de coordenadas entre chamadas (o
  projeto original já acerta nesses pontos e devem ser preservados).
- Adição: cada ação executada gera um identificador único e é assinada com
  timestamp antes de ir para o log — previne repetição acidental
  (idempotência).

### 3.4 Registro de Auditoria (novo componente)
- Log append-only (ex.: SQLite local ou arquivo JSONL assinado) com: ação
  proposta, decisão do broker, screenshot antes/depois, resultado do OCR de
  verificação.
- Retenção configurável — resolve a lacuna de "não há DOM para reconstruir o que
  aconteceu" citada na análise do projeto original. Sem isso, qualquer
  investigação pós-incidente é impossível.

---

## 4. Comparação direta com o projeto analisado

| Dimensão | Projeto original | Proposta alternativa |
|---|---|---|
| Transporte (captura/input) | Mirroring + OCR + CGEvents | Mesmo (mantido — é a parte tecnicamente sólida) |
| Enforcement de consentimento | Instrução textual no prompt | Processo separado (broker), fora do controle do LLM |
| Tratamento de texto de tela | Confiado implicitamente | Marcado como não confiável + triagem de injeção |
| Auditoria | Nenhuma persistente | Log append-only com screenshots por ação |
| Granularidade de permissão | Binária (uso ou não uso da ferramenta) | Por app / por verbo de ação, configurável |
| Escala | 1 telefone, 1 sessão | Mesmo modelo (correto para uso pessoal; não é vetor de melhoria prioritário) |

---

## 5. Riscos residuais (mesmo com as correções)

1. **Broker mal configurado ainda é ponto único de falha.** Se o usuário deixa
   allowlists vazias por preguiça, a proteção degrada para o modelo original.
   Mitigação: broker vem com denylist padrão pré-populada (apps financeiros,
   Mensagens, Mail, Configurações) que exige opt-out explícito, não opt-in.
2. **Confirmação fora de banda tem custo de fricção.** Para uso pessoal intenso,
   notificações constantes podem levar o usuário a aprovar sem ler. Mitigação:
   agrupar confirmações por lote quando o agente propõe uma sequência de ações
   relacionadas, com resumo único.
3. **Classificador de injeção baseado em heurística tem falsos negativos.** Não
   substitui a separação de proveniência (item 3.1), que é a defesa estrutural
   real; o classificador é apenas uma camada adicional de sinalização.
4. **iPhone Mirroring continua sendo a única via sem jailbreak** — qualquer
   mudança da Apple no comportamento dessa janela (ex.: bloqueio de captura,
   mudança de permissões) quebra toda a base, tanto no projeto original quanto
   nesta proposta. Não há mitigação de engenharia para isso; é risco de
   dependência de plataforma.

---

## 6. Recomendação de implementação incremental

1. **Fase 1 (baixo esforço, alto retorno):** adicionar a tag de proveniência no
   texto OCR e o log de auditoria com screenshots. Resolve as duas lacunas mais
   graves com menor custo de engenharia.
2. **Fase 2:** broker de política como processo separado com allowlist/denylist
   padrão.
3. **Fase 3:** canal de confirmação fora de banda (push/Slack) e agrupamento de
   confirmações em lote.
4. **Fase 4 (opcional):** classificador heurístico de tentativas de injeção no
   texto de tela.

Esse sequenciamento prioriza as correções que eliminam dependência de "o LLM se
comportar bem" antes de otimizar experiência de uso.
