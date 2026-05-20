export async function POST(request) {
  try {
    const { origem, destino } = await request.json()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return Response.json({
        ok: false,
        error: 'Google Maps API não configurada. Informe a distância manualmente.'
      }, { status: 400 })
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origem)}&destinations=${encodeURIComponent(destino)}&mode=driving&key=${apiKey}&language=pt-BR`

    const resp = await fetch(url)
    const data = await resp.json()

    if (data.status !== 'OK') {
      return Response.json({ ok: false, error: 'Erro ao consultar Maps' }, { status: 400 })
    }

    const element = data.rows[0]?.elements[0]
    if (element?.status !== 'OK') {
      return Response.json({ ok: false, error: 'Endereço não encontrado' }, { status: 400 })
    }

    const distanciaMetros = element.distance.value
    const distanciaKm = +(distanciaMetros / 1000).toFixed(1)
    const duracaoTexto = element.duration.text

    return Response.json({ ok: true, km: distanciaKm, duracao: duracaoTexto })
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
