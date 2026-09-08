# Alicerce — controle financeiro

App de controle financeiro mensal (React + Vite + Tailwind + Supabase), feito para uso
compartilhado entre duas pessoas em celulares diferentes, com sincronização em tempo real.

## Rodar localmente (opcional)

```bash
npm install
cp .env.example .env   # depois preencha com as chaves do seu projeto Supabase
npm run dev
```

## Configurar o backend (Supabase — gratuito)

1. Crie um projeto em https://supabase.com
2. Abra o **SQL Editor**, cole o conteúdo de `supabase-setup.sql` e clique em **Run**
3. Em **Settings → API**, copie a **Project URL** e a chave **anon public**
4. Use esses dois valores como `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (no arquivo `.env` local, e/ou nas variáveis de ambiente do seu provedor de deploy)

## Leitura automática do valor (opcional, mas recomendado)

Ao anexar o print, o app envia a imagem para `api/extract-receipt.js` (função serverless),
que usa a API da Anthropic para identificar o valor — ou os valores, se houver mais de uma
transação na mesma imagem, somando-os automaticamente. O campo de valor continua editável
para você conferir/corrigir.

Isso exige uma chave de API separada da sua assinatura do Claude.ai:

1. Crie uma conta em https://console.anthropic.com e gere uma API key
2. Adicione créditos (o custo por comprovante lido é frações de centavo, usando o modelo Haiku)
3. Defina `ANTHROPIC_API_KEY` (sem o prefixo `VITE_`) nas variáveis de ambiente do seu provedor
   de deploy — essa chave roda só no servidor e nunca é exposta ao navegador

Sem essa chave configurada, o app continua funcionando normalmente — só não preenche o valor
sozinho, e você digita como antes.

## Publicar (Vercel ou Netlify — gratuito)

Suba esta pasta para um repositório no GitHub e importe o repositório na Vercel ou Netlify.
Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `ANTHROPIC_API_KEY` nas variáveis de
ambiente do projeto antes do primeiro deploy. Build command: `npm run build`. Output directory: `dist`.
A pasta `api/` é reconhecida automaticamente pela Vercel como função serverless (na Netlify,
esse formato de função precisaria ser adaptado — a Vercel é o caminho mais direto aqui).

Para testar a leitura automática localmente (opcional), use `vercel dev` em vez de `npm run dev`,
já que o servidor do Vite sozinho não executa a pasta `api/`.
