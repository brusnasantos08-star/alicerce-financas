// Vercel Serverless Function — roda no servidor, nunca no navegador.
// Recebe a imagem do comprovante em base64 e usa a API da Anthropic (Claude)
// para identificar automaticamente o(s) valor(es) da transação.
//
// A chave da API (ANTHROPIC_API_KEY) fica só aqui no servidor — nunca é enviada
// para o navegador, diferente de uma variável VITE_*.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
    return;
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: 'Imagem ausente.' });
    return;
  }

  const tool = {
    name: 'registrar_compras',
    description: 'Registra cada valor de compra ou transferência identificado no comprovante.',
    input_schema: {
      type: 'object',
      properties: {
        purchases: {
          type: 'array',
          description: 'Uma entrada para cada transação distinta e visível na imagem.',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Valor em reais, número puro (ex: 45.9), sem R$ e sem vírgula.' },
              description: { type: 'string', description: 'Descrição curta se estiver visível (destinatário, estabelecimento), senão string vazia.' },
            },
            required: ['amount'],
          },
        },
      },
      required: ['purchases'],
    },
  };

  const promptText =
    'Esta imagem é um print de comprovante de pagamento (PIX, transferência ou cartão), possivelmente em português. ' +
    'Ela pode conter UMA ou VÁRIAS transações diferentes (por exemplo, dois comprovantes de PIX seguidos na mesma tela). ' +
    'Identifique cada valor de transação que representa dinheiro pago/enviado — ignore saldo em conta e outros números que não sejam o valor da transação. ' +
    'Chame a ferramenta registrar_compras com um item para cada transação encontrada. ' +
    'Se não conseguir identificar nenhum valor com confiança, chame a ferramenta com uma lista vazia.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'registrar_compras' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: promptText },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'Falha ao consultar a IA.', details: errText });
      return;
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
    const purchases =
      toolUse && toolUse.input && Array.isArray(toolUse.input.purchases)
        ? toolUse.input.purchases.filter((p) => typeof p.amount === 'number' && p.amount > 0)
        : [];

    res.status(200).json({ purchases });
  } catch (err) {
    res.status(500).json({ error: 'Erro inesperado ao processar a imagem.' });
  }
}
