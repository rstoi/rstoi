# Deploy — setupOS Cloud

## Pré-requisitos
- Projeto GCP/Firebase (ex.: `setupos-cloud`) com **Firebase Auth** (provedor
  Google) habilitado e o domínio `setup.com.br` autorizado.
- `gcloud` e `firebase-tools` autenticados.
- Service account do gateway com permissão de verificar ID tokens
  (`roles/firebaseauth.viewer`) — em Cloud Run a credencial vem por ADC.

## 1. Gateway → Cloud Run
```bash
cd console/gateway
gcloud run deploy setupos-gateway \
  --source . \
  --region southamerica-east1 \
  --no-allow-unauthenticated \
  --set-env-vars ALLOWED_DOMAIN=setup.com.br,GOOGLE_CLOUD_PROJECT=setupos-cloud,OPERATOR_ROLES=operador,admin
# Coloque atrás do IAP, liberando o grupo do Cloud Identity.
```
Anote a URL gerada (`https://setupos-gateway-XXXX.run.app`).

## 2. Frontend → Firebase Hosting
```bash
cd console/web
cp .env.example .env.local      # preencha as chaves do Firebase + GATEWAY_URL
npm install
npm run build                   # gera out/ (export estático)
firebase deploy --only hosting
```

## 3. Restrição de domínio (defesa em profundidade)
1. **Cliente:** `hd=setup.com.br` no provedor Google (conveniência).
2. **Gateway (autoridade):** rejeita token sem `email_verified` ou cujo domínio
   ≠ `setup.com.br` (ver `console/gateway/src/auth.ts`).
3. **IAP:** libera apenas o grupo do Cloud Identity na frente do Cloud Run.
4. **RBAC:** custom claims `roles` (sincronizadas dos grupos do Workspace)
   controlam Terminal, Claude CLI e Governança.

## Teste rápido pós-deploy
```bash
curl -s https://setupos-gateway-XXXX.run.app/healthz   # {"ok":true,...}
```
Login no Hosting com conta @setup.com.br deve abrir o console; conta de outro
domínio deve ser recusada.
