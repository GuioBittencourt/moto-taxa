export async function POST(request) {
  try {
    const { origem, destino } = await request.json()

    function limparEndereco(end) {
      return end.replace(/\s*-\s*[^,]+/g, '').trim()
    }

    function expandirAbreviacoes(end) {
      return end
        .replace(/\bR\.\s*/g, 'Rua ')
        .replace(/\bAv\.\s*/g, 'Avenida ')
        .replace(/\bAl\.\s*/g, 'Alameda ')
        .replace(/\bTrav\.\s*/g, 'Travessa ')
        .replace(/\bPç\.\s*/g, 'Praça ')
        .replace(/\bEst\.\s*/g, 'Estrada ')
        .trim()
    }

    async function geocodificar(endereco) {
      const endExpandido = expandirAbreviacoes(endereco)
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endExpandido)}&format=json&limit=1&countrycodes=br`
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'MotoTaxa/1.0 (moto-taxa.vercel.app)' }
      })
      const data = await resp.json()
      if (data.length === 0) return null
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }

    async function calcularRota(coordOrigem, coordDestino) {
      const url = `https://router.project-osrm.org/route/v1/driving/${coordOrigem.lon},${coordOrigem.lat};${coordDestino.lon},${coordDestino.lat}?overview=false`
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const rota = data.routes[0]
        const km = +(rota.distance / 1000).toFixed(1)
        const minutos = Math.round(rota.duration / 60)
        const duracao = minutos < 60
          ? `${minutos} min`
          : `${Math.floor(minutos / 60)}h ${minutos % 60}min`
        return { ok: true, km, duracao }
      }
      return { ok: false }
    }

    const origemLimpa = limparEndereco(origem)
    // Remove cidade duplicada se já vier no endereço
    const origemSemDup = origemLimpa
      .replace(/,\s*São José dos Campos.*$/i, '')
      .trim()

    const partes = destino.split(',').map(p => p.trim())
    const sufixosIgnorar = ['sp', 'brasil', 'brazil', 'rj', 'mg', 'pr', 'rs', 'ba', 'sc']
    const partesUteis = partes.filter(p => !sufixosIgnorar.includes(p.toLowerCase()))
    const cidade = partesUteis.length >= 2 ? partesUteis[partesUteis.length - 1] : 'São José dos Campos'
    const rua = limparEndereco(partesUteis[0] || partes[0])
    const numero = partesUteis[1] || ''

    const variacoesDestino = [
      numero ? `${rua}, ${numero}, ${cidade}, SP, Brasil` : `${rua}, ${cidade}, SP, Brasil`,
      numero ? `${rua}, ${numero}, SP, Brasil` : `${rua}, SP, Brasil`,
      `${rua}, ${cidade}`,
      `${rua}, SP`,
    ]

    const coordOrigem = await geocodificar(`${origemSemDup}, São José dos Campos, SP, Brasil`)
    if (!coordOrigem) {
      return Response.json({ ok: false, error: 'Endereço de origem não encontrado. Informe o km manualmente.' }, { status: 400 })
    }

    let coordDestino = null
    for (const variacao of variacoesDestino) {
      coordDestino = await geocodificar(variacao)
      if (coordDestino) break
    }

    if (!coordDestino) {
      return Response.json({ ok: false, error: 'Endereço de destino não encontrado. Informe o km manualmente.' }, { status: 400 })
    }

    const resultado = await calcularRota(coordOrigem, coordDestino)
    if (resultado.ok) return Response.json(resultado)

    return Response.json({ ok: false, error: 'Não foi possível calcular a rota. Informe o km manualmente.' }, { status: 400 })

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
