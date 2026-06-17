export async function POST(request) {
  try {
    const { imageBase64, mimeType } = await request.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ ok: false, error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Esta é uma comanda de delivery brasileiro. Extraia com precisão todos os dados de entrega.

Responda SOMENTE em JSON válido sem markdown:
{"cliente":"nome completo do cliente","rua":"nome da rua e número ex: Rua das Flores, 123","bairro":"nome do bairro","cidade":"nome da cidade ex: São José dos Campos","endereco_completo":"rua completa, bairro, cidade ex: Rua das Flores 123, Jardim Satélite, São José dos Campos"}`
            }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return Response.json({ ok: false, error: data.error?.message || 'Erro na API Anthropic' }, { status: 500 })
    }

    const text = data.content[0].text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)

    // Retorna debug para identificar o problema
    return Response.json({ ok: true, data: parsed, _debug: parsed })
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
