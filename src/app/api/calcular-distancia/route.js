export async function POST(request) {
  try {
    const { origem, destino, modeMedicao } = await request.json()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Google Maps API não configurada.' }, { status: 400 })
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origem)}&destinations=${encodeURIComponent(destino)}&mode=driving&key=${apiKey}&language=pt-BR&region=BR`

    const resp = await fetch(url)
    const data = await resp.json()

    console.log('Maps FULL response:', JSON.stringify(data))

    if (data.status !== 'OK') {
      return Response.json({ ok: false, error: `Maps erro: ${data.status}` }, { status: 400 })
    }

    const row = data.rows?.[0]
    const element = row?.elements?.[0]

    console.log('row:', JSON.stringify(row))
    console.log('element:', JSON.stringify(element))

    if (!element || element.status !== 'OK') {
      return Response.json({ 
        ok: false, 
        error: `Endereço não encontrado. Status: ${element?.status}. Destino enviado: ${destino}` 
      }, { status: 400 })
    }

    const distanciaKm = +(element.distance.value / 1000).toFixed(1)
    const duracaoTexto = element.duration.text

    return Response.json({ ok: true, km: distanciaKm, duracao: duracaoTexto })
  } catch (error) {
    console.error('calcular-distancia error:', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
