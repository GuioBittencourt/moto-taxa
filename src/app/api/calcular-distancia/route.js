export async function POST(request) {
  try {
    const { origem, destino, modeMedicao } = await request.json()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return Response.json({ ok: false, error: 'GOOGLE_MAPS_API_KEY não configurada.' }, { status: 400 })
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origem)}&destinations=${encodeURIComponent(destino)}&mode=driving&key=${apiKey}&language=pt-BR&region=BR`

    const resp = await fetch(url)
    const data = await resp.json()

    if (data.status !== 'OK') {
      return Response.json({ 
        ok: false, 
        error: `Maps status: ${data.status} | origem: ${origem} | destino: ${destino}` 
      }, { status: 400 })
    }

    const element = data.rows?.[0]?.elements?.[0]

    if (!element || element.status !== 'OK') {
      return Response.json({ 
        ok: false, 
        error: `Element status: ${element?.status} | origem: ${origem} | destino: ${destino}` 
      }, { status: 400 })
    }

    const distanciaKm = +(element.distance.value / 1000).toFixed(1)
    const duracaoTexto = element.duration.text

    return Response.json({ ok: true, km: distanciaKm, duracao: duracaoTexto })
  } catch (error) {
    return Response.json({ ok: false, error: 'Exceção: ' + error.message }, { status: 500 })
  }
}
