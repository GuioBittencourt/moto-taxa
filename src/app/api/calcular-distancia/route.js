export async function POST(request) {
  try {
    const { origem, destino, modeMedicao } = await request.json()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Google Maps API não configurada.' }, { status: 400 })
    }

    async function consultarMaps(orig, dest) {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(orig)}&destinations=${encodeURIComponent(dest)}&mode=driving&key=${apiKey}&language=pt-BR&region=BR`
      const resp = await fetch(url)
      const data = await resp.json()
      const element = data.rows?.[0]?.elements?.[0]
      if (data.status === 'OK' && element?.status === 'OK') {
        return {
          ok: true,
          km: +(element.distance.value / 1000).toFixed(1),
          duracao: element.duration.text
        }
      }
      return { ok: false, status: element?.status || data.status }
    }

    // Tentativa 1 — endereço completo como veio
    let resultado = await consultarMaps(origem, destino)
    if (resultado.ok) return Response.json(resultado)

    // Tentativa 2 — remove o bairro do destino (mantém rua, número e cidade)
    // Ex: "R. Foo, 35, Santana, São José dos Campos, SP" → "R. Foo, 35, São José dos Campos, SP"
    const partes = destino.split(',').map(p => p.trim())
    if (partes.length >= 3) {
      // Tenta sem a parte do meio (bairro)
      const semBairro = [partes[0], partes[1], ...partes.slice(-2)].join(', ')
      resultado = await consultarMaps(origem, semBairro)
      if (resultado.ok) return Response.json(resultado)

      // Tentativa 3 — só rua + número + cidade
      const soCidade = [partes[0], partes[1], partes[partes.length - 1]].join(', ')
      resultado = await consultarMaps(origem, soCidade)
      if (resultado.ok) return Response.json(resultado)
    }

    return Response.json({
      ok: false,
      error: `Endereço não encontrado pelo Maps. Informe o km manualmente.`
    }, { status: 400 })

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
