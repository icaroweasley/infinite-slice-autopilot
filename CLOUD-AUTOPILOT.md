# Fábrica 24/7 na Nuvem (Sua Operação Privada de Renda Passiva)

Este guia separa claramente **dois usos**:
- **Versão do Comprador (para vender):** gere o `.zip` limpo com `npm run package-buyer`. Quem comprar instala no Claude Code ou Antigravity, abre `npm run studio`, gera 1 vídeo por vez e posta por conta própria.
- **Sua Fábrica Privada 24/7 na Nuvem:** roda sozinha (mesmo com seu PC desligado), inventa um vídeo inédito a cada ciclo, renderiza o `.mp4` com áudio ASMR 48 kHz e posta automaticamente no seu Instagram em inglês.

---

## Opção 1 — 100% Grátis na Nuvem (Recomendada): GitHub Actions + Gemini API Grátis

Você não precisa pagar servidor nem deixar o computador ligado.

### Passo 1 — Pegar as 3 chaves gratuitas
1. **IA Criadora 3D (Grátis):** Crie uma chave `GEMINI_API_KEY` no **Google AI Studio** (`aistudio.google.com/apikey`) — usa o modelo `gemini-2.5-flash` na camada gratuita (ou, se preferir Claude, use `ANTHROPIC_API_KEY`).
2. **Hospedagem temporária do MP4 (Grátis):** Crie conta gratuita no **Cloudinary** (`cloudinary.com`) → anote `CLOUDINARY_CLOUD_NAME` e crie um *Unsigned Upload Preset* (`CLOUDINARY_UPLOAD_PRESET`). *(Ou pule esta etapa se usar n8n/Make via `N8N_WEBHOOK_URL`)*.
3. **Instagram Reels Automático (Grátis):**
   - Transforme a conta nova do Instagram em **Conta Profissional (Criador ou Comercial)** vinculada a uma Página do Facebook.
   - Gere `IG_USER_ID` e `IG_ACCESS_TOKEN` (permissões `instagram_basic` e `instagram_content_publish`) no Meta for Developers — **OU** conecte tudo visualmente num webhook do **n8n** colocando apenas `N8N_WEBHOOK_URL`.

### Passo 2 — Subir em um repositório **PRIVADO** no GitHub
1. Crie um repositório **Privado** no GitHub (para proteger o código do seu produto pago) e suba a pasta `infinite-slice-skill`.
2. Vá em **Settings → Secrets and variables → Actions → New repository secret** e cadastre:
   - `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY`)
   - `N8N_WEBHOOK_URL` **OU** (`IG_USER_ID` + `IG_ACCESS_TOKEN` + `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_UPLOAD_PRESET`)
3. Vá na aba **Actions → Infinite Slice 24/7 Reels Autopilot → Run workflow** (deixe `dry_run = true` na 1ª vez para testar sem postar!).

### Passo 3 — Ajustar a frequência (1h, 4h ou 3x/dia)
Abra `.github/workflows/autopilot-reels.yml` e ajuste a linha `cron:`:
- **Semanas 1 e 2 (Aquecimento seguro — evita shadowban em conta nova!):**
  `cron: '0 9,15,21 * * *'` *(3 Reels por dia nos horários de pico dos EUA/Europa)*
- **Semana 3+ (Escala segura):**
  `cron: '0 */4 * * *'` *(6 Reels por dia — a cada 4 horas)*
- **Modo turbo 1 em 1 hora (24/dia — só em conta já aquecida!):**
  `cron: '0 * * * *'` *(Atenção: 24 Reels/dia usa ~2.400 min/mês de GitHub Actions; para 24/dia contínuo prefira a Opção 2 abaixo em VPS gratuita da Oracle Cloud ou Instinct!)*

---

## Opção 2 — Rodar no **Instinct** ou numa VPS Grátis (Oracle Cloud Free Tier)

Se você quiser usar o **Instinct** (agente em nuvem gratuito) ou uma VM Linux gratuita (Oracle Cloud Always Free / Hetzner €4/mês) rodando **24 vezes por dia (de 1 em 1 hora)** sem limite de minutos:

1. Copie a pasta `infinite-slice-skill` para a VM do Instinct / VPS Linux.
2. Rode uma vez:
   ```bash
   sudo apt update && sudo apt install -y ffmpeg
   npm install
   npx playwright-core install chromium --with-deps
   cp .env.example .env
   # preencha GEMINI_API_KEY e N8N_WEBHOOK_URL (ou IG_USER_ID + IG_ACCESS_TOKEN) no .env
   ```
3. Agende no `crontab -e` da VM (ou peça direto para o Instinct agendar):
   ```cron
   # Roda de 1 em 1 hora (ou troque * por */4 para cada 4 horas):
   0 * * * * cd /home/ubuntu/infinite-slice-skill && node scripts/autopilot-cloud.mjs --res 720x1280 --fps 60 --publish --cleanup >> autopilot.log 2>&1
   ```

---

## Testar o Autopilot agora no seu PC (sem postar no Instagram)

```powershell
cd "e:\jogo antigravity\infinite-slice-skill"
node scripts/autopilot-cloud.mjs --quick --dry-run
```

## Gerar o `.zip` limpo da Versão do Comprador (para vender)

```powershell
cd "e:\jogo antigravity\infinite-slice-skill"
npm run package-buyer
```
Isso gera `dist-buyer/infinite-slice-skill-buyer-edition.zip` sem suas credenciais, sem seu histórico privado e sem o robô de nuvem!
