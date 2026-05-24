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

    console.log('Maps origem:', origem)
    console.log('Maps destino:', destino)
    console.log('Maps status:', data.status)
    console.log('Maps element:', JSON.stringify(data.rows?.[0]?.elements?.[0]))

    if (data.status !== 'OK') {
      return Response.json({ ok: false, error: `Maps erro: ${data.status}` }, { status: 400 })
    }

    const element = data.rows[0]?.elements[0]
    if (element?.status !== 'OK') {
      return Response.json({ ok: false, error: `Endereço não encontrado: ${element?.status}` }, { status: 400 })
    }

    const distanciaKm = +(element.distance.value / 1000).toFixed(1)
    const duracaoTexto = element.duration.text

    return Response.json({ ok: true, km: distanciaKm, duracao: duracaoTexto })
  } catch (error) {
    console.error('calcular-distancia error:', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
