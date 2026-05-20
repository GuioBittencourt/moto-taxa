export async function POST(request) {
  try {
    const { imageBase64, mimeType } = await request.json()

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
              source: { type: 'base64', media_type: mimeType, data: imageBase64 }
            },
            {
              type: 'text',
              text: `Esta é uma comanda de delivery. Extraia as informações e responda SOMENTE em JSON válido sem markdown:
{"cliente":"nome do cliente","endereco":"endereço completo de entrega","bairro":"nome do bairro","numero_pedido":"número do pedido se visível"}`
            }
          ]
        }]
      })
    })

    const data = await response.json()
    const text = data.content[0].text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)

    return Response.json({ ok: true, data: parsed })
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
