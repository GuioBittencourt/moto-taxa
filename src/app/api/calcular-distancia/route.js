export async function POST(request) {
  try {
    const { origem, destino } = await request.json()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Google Maps API não configurada.' }, { status: 400 })
    }

    function limparEndereco(end) {
      // Remove " - Bairro" ou " - Cidade" que vem colado no número
      // Ex: "Rua João de Paula, 14 - Jardim América" → "Rua João de Paula, 14"
      return end.replace(/\s*-\s*[^,]+/g, '').trim()
    }

    async function consultarMaps(orig, dest) {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(orig)}&destinations=${encodeURIComponent(dest)}&mode=driving&key=${apiKey}&language=pt-BR&region=BR`
      const resp = await fetch(url)
      const data = await resp.json()
      const element = data.rows?.[0]?.elements?.[0]
      if (data.status === 'OK' && element?.status === 'OK') {
        return { ok: true, km: +(element.distance.value / 1000).toFixed(1), duracao: element.duration.text }
      }
      return { ok: false, status: data.status, elementStatus: element?.status }
    }

    const origemLimpa = limparEndereco(origem)

    const partes = destino.split(',').map(p => p.trim())
    const sufixosIgnorar = ['sp', 'brasil', 'brazil', 'rj', 'mg', 'pr', 'rs', 'ba', 'sc']
    const partesUteis = partes.filter(p => !sufixosIgnorar.includes(p.toLowerCase()))
    const cidade = partesUteis.length >= 2 ? partesUteis[partesUteis.length - 1] : 'São José dos Campos'
    const rua = limparEndereco(partesUteis[0] || partes[0])
    const numero = partesUteis[1] || ''

    // Tentativa 1 — rua + número + cidade + SP, Brasil
    const t1 = numero
      ? `${rua}, ${numero}, ${cidade}, SP, Brasil`
      : `${rua}, ${cidade}, SP, Brasil`
    const r1 = await consultarMaps(origemLimpa, t1)
    if (r1.ok) return Response.json(r1)

    // Tentativa 2 — endereço completo limpo
    const destinoLimpo = destino.replace(/, SP, Brasil$/i, '').replace(/, Brasil$/i, '').trim()
    const t2 = `${limparEndereco(destinoLimpo)}, SP, Brasil`
    const r2 = await consultarMaps(origemLimpa, t2)
    if (r2.ok) return Response.json(r2)

    // Tentativa 3 — só rua + SP, Brasil
    const t3 = `${rua}, SP, Brasil`
    const r3 = await consultarMaps(origemLimpa, t3)
    if (r3.ok) return Response.json(r3)

    return Response.json({ ok: false, error: 'Endereço não encontrado. Informe o km manualmente.' }, { status: 400 })

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
