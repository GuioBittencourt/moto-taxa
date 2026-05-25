export async function POST(request) {
  try {
    const { origem, destino } = await request.json()

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
        return { ok: true, km: +(element.distance.value / 1000).toFixed(1), duracao: element.duration.text }
      }
      return { ok: false }
    }

    // Extrai só rua + número do destino (remove bairro)
    // Ex: "R. Foo, 35, Santana, São José dos Campos" → pega parte[0] + parte[1] + cidade
    const partes = destino.split(',').map(p => p.trim())
    const cidade = partes[partes.length - 1] // última parte = cidade

    // Tentativa 1 — rua + número + cidade (sem bairro)
    if (partes.length >= 2) {
      const semBairro = `${partes[0]}, ${partes[1]}, ${cidade}, SP, Brasil`
      const r1 = await consultarMaps(origem, semBairro)
      if (r1.ok) return Response.json(r1)
    }

    // Tentativa 2 — endereço completo como veio
    const r2 = await consultarMaps(origem, destino + ', SP, Brasil')
    if (r2.ok) return Response.json(r2)

    // Tentativa 3 — só rua + número + SP
    if (partes.length >= 2) {
      const minimo = `${partes[0]}, ${partes[1]}, SP, Brasil`
      const r3 = await consultarMaps(origem, minimo)
      if (r3.ok) return Response.json(r3)
    }

    return Response.json({ ok: false, error: 'Endereço não encontrado. Informe o km manualmente.' }, { status: 400 })

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
