export async function POST(request) {
  try {
    const { texto } = await request.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Você é um assistente que interpreta regras de taxa de entrega para motoboys no Brasil.

O usuário vai descrever em linguagem natural como funciona a precificação das suas entregas.
Sua tarefa é converter isso para um JSON estruturado.

Texto do usuário: "${texto}"

Responda SOMENTE com JSON válido neste formato exato, sem markdown:
{
  "tipo": "composta",
  "taxa_fixa_entrega": 0,
  "faixas_km": [
    { "km_min": 1, "km_max": 5, "tipo": "por_km", "valor": 1 },
    { "km_min": 6, "km_max": 10, "tipo": "fixo", "valor": 7 }
  ],
  "excedente_km": null,
  "bairros": [],
  "resumo": "Descrição legível das regras para o usuário confirmar"
}

Regras de interpretação:
- Se mencionar "R$ X por km", tipo é "por_km" com o valor
- Se mencionar "R$ X fixo para faixa Y a Z km", tipo é "fixo"
- Se mencionar "R$ X fixo por entrega", coloca em taxa_fixa_entrega
- Se mencionar "mais R$ X se passar de Y km", usa excedente_km
- Se mencionar bairros específicos com valores, preenche o array bairros
- Sempre preencha o campo "resumo" com uma descrição clara em português para o usuário confirmar`
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
