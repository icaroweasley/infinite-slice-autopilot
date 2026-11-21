# 🚀 Guia de 5 Minutos — Colocar o Site no Ar + Venda 100% Automática 24/7

Todo o site, design, vídeos, imagens e produto comercial (`.zip`) já estão prontos. Você só precisa plugar o **link de pagamento** (para o dinheiro cair na sua conta e o `.zip` ser entregue automaticamente por e-mail) e arrastar a pasta `sales-site` para publicar grátis!

---

## Passo 1 — Criar o Produto Digital com Entrega Automática do `.zip` (3 minutos)

### Opção A — Vender em DÓLAR para o Mundo Todo (Recomendado para `@atomslice3d` em inglês!)
1. Crie conta grátis em **https://gumroad.com** (ou **https://lemonsqueezy.com**).
2. Clique em **New Product** → tipo **Digital Product**:
   - **Name:** `Infinite Slice 3D — AI Creator Studio & Skill`
   - **Price:** `$29` (pagamento único)
   - **Cover image:** suba `sales-site/assets/og-banner.jpg`
   - **Content (arquivo entregue automaticamente após o pagamento):** suba o arquivo:
     `dist-buyer/infinite-slice-skill-buyer-edition.zip`
3. Clique em **Publish** e copie o link do checkout (ex: `https://atomslice3d.gumroad.com/l/infinite-slice-3d`).

### Opção B — Também aceitar Pix/Cartão em REAIS no Brasil (Opcional)
1. Crie conta grátis na **https://kiwify.com.br** (ou Hotmart).
2. Cadastre o produto em **R$ 97**, suba o mesmo `.zip` (`dist-buyer/infinite-slice-skill-buyer-edition.zip`) na área de entrega, e copie seu link de checkout da Kiwify!

---

## Passo 2 — Colar o(s) Link(s) de Checkout no Site (10 segundos)
Abra o arquivo `sales-site/checkout-config.js` e cole seus links:
```js
checkoutUrlUSD: 'https://atomslice3d.gumroad.com/l/infinite-slice-3d',
checkoutUrlBRL: 'https://pay.kiwify.com.br/SEU-LINK',
```
*(O site detecta o idioma do visitante automaticamente: gringo vê em inglês + `$29` + link USD; brasileiro vê em português + `R$ 97` + link Pix/BRL!)*

---

## Passo 3 — Publicar o Site 100% GRÁTIS com HTTPS em 10 Segundos
1. Abra **https://app.netlify.com/drop** (grátis pra sempre, não precisa de cartão!).
2. Arraste a pasta **`sales-site`** inteira direto do Windows Explorer para dentro do navegador.
3. Em 10 segundos ele gera seu link HTTPS oficial (ex: `https://atomslice3d.netlify.app` — você pode renomear o subdomínio grátis em **Site settings → Change site name** para `atomslice3d.netlify.app`!).

---

## Passo 4 — Colar na Bio do `@atomslice3d`
1. Abra o Instagram `@atomslice3d` → **Editar perfil**:
   - **Foto de perfil:** suba `brand-kit/avatar-atomslice3d.jpg`
   - **Nome:** `Atom Slice 3D | Viral 3D Slicing`
   - **Bio:** copie a **Opção A** de `brand-kit/INSTAGRAM-PROFILE-KIT.md`
   - **Link:** cole `https://atomslice3d.netlify.app` (título: `🔪 Get Infinite Slice 3D Studio`)
2. Pronto! Seu robô já posta **3 Reels/dia em inglês com CTA apontando para o link na bio** → o visitante clica na bio → cai no seu site de vendas → paga no cartão/Apple Pay/Pix → recebe o `.zip` automaticamente por e-mail 24h por dia! 💰🚀
