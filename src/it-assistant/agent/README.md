# Agente de monitoramento — Assistente de Infraestrutura de TI (baita)

Script leve que roda no computador de casa de cada pessoa do time e envia,
periodicamente, métricas de qualidade de rede (latência, jitter, perda de
pacotes, DNS, velocidade de download/upload e sinal de Wi-Fi quando
disponível) para o painel web. Não precisa de instalação de agente separado —
roda com Node.js, o mesmo runtime já usado no restante do repositório.

## 1. Gerar o token do dispositivo

No painel (`/`), clique em **"+ Adicionar dispositivo"**, dê um nome (ex.:
"Notebook — Renato") e local. O token é mostrado **uma única vez** — copie-o.

## 2. Configurar variáveis de ambiente

```bash
export IT_ASSISTANT_SERVER_URL=https://it.baita.ac   # URL do painel
export IT_ASSISTANT_DEVICE_TOKEN=ita_xxxxxxxxxxxxxxxxxxxx
```

Variáveis opcionais:

| Variável | Padrão | Descrição |
|---|---|---|
| `IT_ASSISTANT_PING_TARGETS` | `1.1.1.1,8.8.8.8` | Hosts usados para medir latência/jitter/perda |
| `IT_ASSISTANT_DNS_HOST` | `google.com` | Host usado para medir tempo de resolução DNS |
| `IT_ASSISTANT_SPEEDTEST_DOWNLOAD_BYTES` | `8000000` (8 MB) | Tamanho do teste de download |
| `IT_ASSISTANT_SPEEDTEST_UPLOAD_BYTES` | `4000000` (4 MB) | Tamanho do teste de upload |
| `IT_ASSISTANT_INTERVAL_MIN` | `5` | Intervalo (minutos) apenas no modo `--watch` |

## 3. Rodar um teste manual

```bash
npm run it-assistant:agent
```

## 4. Agendar execução periódica (recomendado: a cada 5 min)

### Linux / macOS — cron
```bash
crontab -e
# adicione (ajuste os caminhos):
*/5 * * * * cd /caminho/para/rstoi && IT_ASSISTANT_SERVER_URL=https://it.baita.ac IT_ASSISTANT_DEVICE_TOKEN=ita_xxx node dist/it-assistant/agent/monitor.js >> /tmp/it-assistant-agent.log 2>&1
```
(rode `npm run build` antes, para gerar `dist/`.)

### macOS — launchd (alternativa ao cron, mais robusta)
Crie `~/Library/LaunchAgents/ac.baita.it-assistant-agent.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ac.baita.it-assistant-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/caminho/para/rstoi/dist/it-assistant/agent/monitor.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>IT_ASSISTANT_SERVER_URL</key><string>https://it.baita.ac</string>
    <key>IT_ASSISTANT_DEVICE_TOKEN</key><string>ita_xxx</string>
  </dict>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
```
```bash
launchctl load ~/Library/LaunchAgents/ac.baita.it-assistant-agent.plist
```

### Windows — Agendador de Tarefas
```powershell
schtasks /create /tn "baita IT Assistant Agent" /tr "node C:\caminho\para\rstoi\dist\it-assistant\agent\monitor.js" /sc minute /mo 5 ^
  /ru "%USERNAME%" ^
  /st 00:00
```
Defina `IT_ASSISTANT_SERVER_URL` e `IT_ASSISTANT_DEVICE_TOKEN` como variáveis de ambiente do usuário (Painel de Controle → Sistema → Variáveis de Ambiente) antes de agendar.

### Alternativa: modo contínuo (processo de longa duração)
```bash
node dist/it-assistant/agent/monitor.js --watch
```
Roda em loop interno, testando a cada `IT_ASSISTANT_INTERVAL_MIN` minutos — útil
atrás de um `pm2`/`systemd --user` sem depender de cron.

## O que é medido

- **Latência, jitter e perda de pacotes**: ping ICMP contra os hosts em
  `IT_ASSISTANT_PING_TARGETS` (por padrão, âncoras de internet confiáveis —
  a maioria dos serviços de videoconferência bloqueia ICMP diretamente, então
  isso funciona como proxy da qualidade do caminho até a internet).
- **DNS**: tempo para resolver `IT_ASSISTANT_DNS_HOST`.
- **Velocidade de download/upload**: teste contra o próprio servidor do
  assistente (`/speedtest/download` e `/speedtest/upload`), sem depender de
  serviços externos de speedtest.
- **Wi-Fi** (opcional, best-effort): SSID e força do sinal, quando conectado
  por Wi-Fi (via `nmcli`/`iwconfig` no Linux, `airport` no macOS, `netsh` no
  Windows). Se estiver em cabo ou a ferramenta não existir, esses campos
  simplesmente ficam vazios — não é um erro.

Os limiares usados para classificar cada relatório como OK/Atenção/Crítico
estão documentados no painel, em **Guia de solução de problemas**.
