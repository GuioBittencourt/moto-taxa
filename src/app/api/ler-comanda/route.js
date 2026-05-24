export async function POST(request) {
  try {
    const { imageBase64, mimeType } = await request.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ ok: false, error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

    // Aceita qualquer formato de imagem — compatível com todos os celulares
    const tipoImagem = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: tipoImagem, data: imageBase64 }
            },
            {
              type: 'text',
              text: `Esta é uma comanda de delivery brasileiro. Extraia com precisão:
1. Nome do cliente
2. Endereço completo: rua, número, bairro e cidade

Responda SOMENTE em JSON válido sem markdown:
{"cliente":"nome completo do cliente","rua":"nome da rua e número","bairro":"nome do bairro","cidade":"nome da cidade","endereco_completo":"rua, número, bairro, cidade"}`
            }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data))
      return Response.json({ ok: false, error: data.error?.message || 'Erro na API Anthropic' }, { status: 500 })
    }

    const text = data.content[0].text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)

    return Response.json({ ok: true, data: parsed })
  } catch (error) {
    console.error('ler-comanda error:', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
