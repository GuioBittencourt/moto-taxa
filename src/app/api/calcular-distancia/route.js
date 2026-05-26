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
      console.log('NOMINATIM', JSON.stringify({ tentativa: endExpandido, resultados: data.length, primeiro: data[0]?.display_name || null }))
      if (data.length === 0) return null
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }

    async function calcularRota(coordOrigem, coordDestino) {
      const url = `https://router.project-osrm.org/route/v1/driving/${coordOrigem.lon},${coordOrigem.lat};${coordDestino.lon},${coordDestino.lat}?overview=false`
      const resp = await fetch(url)
      const data = await resp.json()
      console.log('OSRM', JSON.stringify({ code: data.code, distancia: data.routes?.[0]?.distance, duracao: data.routes?.[0]?.duration }))
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

    // Extrai partes do destino
    const partes = destino.split(',').map(p => p.trim())
    const sufixosIgnorar = ['sp', 'brasil', 'brazil', 'rj', 'mg', 'pr', 'rs', 'ba', 'sc']
    const partesUteis = partes.filter(p => !sufixosIgnorar.includes(p.toLowerCase()))

    // partesUteis ex: ["R. Sebastião Benedito Dias", "35", "Santana", "São José dos Campos"]
    const cidade = partesUteis.length >= 2 ? partesUteis[partesUteis.length - 1] : 'São José dos Campos'
    const rua = limparEndereco(partesUteis[0] || partes[0])
    const numero = partesUteis.length >= 3 ? partesUteis[1] : ''
    // Bairro: penúltima parte útil, desde que não seja a cidade
    const bairro = partesUteis.length >= 3 ? partesUteis[partesUteis.length - 2] : ''

    // Origem: remove sufixo de cidade duplicado
    const origemLimpa = limparEndereco(origem).replace(/,\s*[\w\s]+,\s*SP,\s*Brasil$/i, '').trim()

    console.log('INPUT', JSON.stringify({ origemLimpa, rua, numero, bairro, cidade }))

    // Geocodifica origem
    const coordOrigem = await geocodificar(`${origemLimpa}, ${cidade}, SP, Brasil`)
    if (!coordOrigem) {
      return Response.json({ ok: false, error: 'Origem não encontrada. Informe o km manualmente.' }, { status: 400 })
    }

    // Variações do destino — do mais específico ao mais genérico
    // Nunca usa a cidade sozinha como fallback (impreciso demais)
    const variacoesDestino = [
      numero ? `${rua}, ${numero}, ${cidade}, SP` : `${rua}, ${cidade}, SP`,
      numero ? `${rua}, ${numero}, SP` : `${rua}, SP`,
      bairro ? `${bairro}, ${cidade}, SP` : null,
      bairro ? `${bairro}, SP` : null,
    ].filter(Boolean)

    let coordDestino = null
    for (const variacao of variacoesDestino) {
      coordDestino = await geocodificar(variacao)
      if (coordDestino) break
    }

    if (!coordDestino) {
      return Response.json({ ok: false, error: 'Destino não encontrado. Informe o km manualmente.' }, { status: 400 })
    }

    const resultado = await calcularRota(coordOrigem, coordDestino)
    if (resultado.ok) return Response.json(resultado)

    return Response.json({ ok: false, error: 'Rota não calculada. Informe o km manualmente.' }, { status: 400 })

  } catch (error) {
    console.log('ERRO', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}