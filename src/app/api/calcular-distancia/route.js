import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function normalizarEndereco(texto) {
  if (!texto) return ''
  let t = texto.trim()

  const expansoes = [
    [/\bR\.\s*/gi, 'Rua '],
    [/\bAv\.\s*/gi, 'Avenida '],
    [/\bAl\.\s*/gi, 'Alameda '],
    [/\bTv\.\s*/gi, 'Travessa '],
    [/\bTrav\.\s*/gi, 'Travessa '],
    [/\bPç\.\s*/gi, 'Praça '],
    [/\bPc\.\s*/gi, 'Praça '],
    [/\bEst\.\s*/gi, 'Estrada '],
    [/\bEstr\.\s*/gi, 'Estrada '],
    [/\bRod\.\s*/gi, 'Rodovia '],
    [/\bLg\.\s*/gi, 'Largo '],
    [/\bQd\.\s*/gi, 'Quadra '],
    [/\bJd\.\s*/gi, 'Jardim '],
    [/\bPq\.\s*/gi, 'Parque '],
    [/\bRes\.\s*/gi, 'Residencial '],
    [/\bCj\.\s*/gi, 'Conjunto '],
    [/\bConj\.\s*/gi, 'Conjunto '],
    [/\bVl\.\s*/gi, 'Vila '],
    [/\bCond\.\s*/gi, 'Condomínio '],
  ]
  for (const [pattern, replacement] of expansoes) t = t.replace(pattern, replacement)

  const expansoesSemPonto = [
    [/\bR\s+(?=[A-ZÀ-Ú])/g, 'Rua '],
    [/\bAv\s+(?=[A-ZÀ-Ú])/g, 'Avenida '],
    [/\bJd\s+(?=[A-ZÀ-Ú])/g, 'Jardim '],
    [/\bPq\s+(?=[A-ZÀ-Ú])/g, 'Parque '],
  ]
  for (const [pattern, replacement] of expansoesSemPonto) t = t.replace(pattern, replacement)

  return t.trim()
}

function chaveNormalizada(texto) {
  return normalizarEndereco(texto)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(request) {
  try {
    const { origem, destino, modeMedicao, estabId, rua, bairro, cidade } = await request.json()

    console.log('DESTINO_RAW', JSON.stringify({ origem, destino, estabId }))

    const LIMITE_KM_PLAUSIVEL = 30

    function limparEndereco(end) {
      return end.replace(/\s*-\s*[^,]+/g, '').trim()
    }

    async function geocodificar(endereco) {
      const endExpandido = normalizarEndereco(endereco)
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endExpandido)}&format=json&limit=1&countrycodes=br`
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'MotoTaxa/1.0 (moto-taxa.vercel.app)' }
      })
      const data = await resp.json()
      console.log('NOMINATIM', JSON.stringify({ tentativa: endExpandido, resultados: data.length, primeiro: data[0]?.display_name || null }))
      if (data.length === 0) return null
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), nome: data[0].display_name }
    }

    async function calcularRota(coordOrigem, coordDestino) {
      const url = `https://router.project-osrm.org/route/v1/driving/${coordOrigem.lon},${coordOrigem.lat};${coordDestino.lon},${coordDestino.lat}?overview=false`
      const resp = await fetch(url)
      const data = await resp.json()
      console.log('OSRM', JSON.stringify({ code: data.code, distancia: data.routes?.[0]?.distance, duracao: data.routes?.[0]?.duration }))
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const rotaRes = data.routes[0]
        const km = +(rotaRes.distance / 1000).toFixed(1)
        const minutos = Math.round(rotaRes.duration / 60)
        const duracao = minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h ${minutos % 60}min`
        return { ok: true, km, duracao }
      }
      return { ok: false }
    }

    // --- 1. Verifica cache primeiro ---
    if (estabId) {
      const buscaBairro = chaveNormalizada(bairro || '')
      const buscaRua = modeMedicao === 'bairro' ? null : chaveNormalizada(rua || '')
      const buscaCidade = chaveNormalizada(cidade || '')

      let query = supabase.from('geocache').select('km_calculado, duracao, total_amostras, origem')
        .eq('estab_id', estabId)
        .eq('modo_medicao', modeMedicao || 'rua')
        .eq('bairro', buscaBairro)
        .eq('cidade', buscaCidade)

      query = buscaRua ? query.eq('rua', buscaRua) : query.is('rua', null)

      const { data: cacheHit } = await query.maybeSingle()

      if (cacheHit) {
        console.log('CACHE_HIT', JSON.stringify(cacheHit))
        return Response.json({
          ok: true,
          km: cacheHit.km_calculado,
          duracao: cacheHit.duracao || 'estimado',
          deCache: true,
          totalAmostras: cacheHit.total_amostras || 1,
          origemCache: cacheHit.origem
        })
      }
    }

    // --- 2. Fluxo normal de geocodificação ---
    const partes = destino.split(',').map(p => p.trim())
    const sufixosIgnorar = ['sp', 'brasil', 'brazil', 'rj', 'mg', 'pr', 'rs', 'ba', 'sc']
    const partesUteis = partes.filter(p => !sufixosIgnorar.includes(p.toLowerCase()))

    const cidadeDestino = partesUteis.length >= 2 ? partesUteis[partesUteis.length - 1] : 'São José dos Campos'
    const ruaDestino = limparEndereco(partesUteis[0] || partes[0])
    const numero = partesUteis.length >= 3 ? partesUteis[1] : ''
    const bairroDestino = partesUteis.length >= 4 ? partesUteis[partesUteis.length - 2] : ''

    const origemLimpa = limparEndereco(origem)
      .replace(/,\s*SP,\s*Brasil\s*$/i, '')
      .replace(/,\s*Brasil\s*$/i, '')
      .trim()

    console.log('INPUT', JSON.stringify({ origemLimpa, partesUteis, ruaDestino, numero, bairroDestino, cidadeDestino }))

    const coordOrigem = await geocodificar(`${origemLimpa}, SP, Brasil`)
    if (!coordOrigem) {
      return Response.json({ ok: false, error: 'Origem não encontrada. Informe o km manualmente.' }, { status: 400 })
    }

    const variacoesDestino = [
      numero ? `${ruaDestino}, ${numero}, ${cidadeDestino}, SP` : `${ruaDestino}, ${cidadeDestino}, SP`,
      bairroDestino ? `${bairroDestino}, ${cidadeDestino}, SP` : null,
      numero ? `${ruaDestino}, ${numero}, SP` : `${ruaDestino}, SP`,
      bairroDestino ? `${bairroDestino}, SP` : null,
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

    if (resultado.ok) {
      if (resultado.km > LIMITE_KM_PLAUSIVEL) {
        console.log('REJEITADO_KM_ABSURDO', JSON.stringify({ km: resultado.km, destinoGeocodificado: coordDestino.nome }))
        return Response.json({
          ok: false,
          error: `Distância calculada (${resultado.km} km) parece incorreta. Informe o km manualmente.`
        }, { status: 400 })
      }

      // --- 3. Salva no cache (primeira vez, sem amostras ainda) ---
      if (estabId) {
        const buscaBairro = chaveNormalizada(bairro || bairroDestino || '')
        const buscaRua = modeMedicao === 'bairro' ? null : chaveNormalizada(rua || ruaDestino || '')
        const buscaCidade = chaveNormalizada(cidade || cidadeDestino || '')

        await supabase.from('geocache').upsert({
          estab_id: estabId,
          rua: buscaRua,
          bairro: buscaBairro,
          cidade: buscaCidade,
          modo_medicao: modeMedicao || 'rua',
          km_calculado: resultado.km,
          duracao: resultado.duracao,
          origem: 'nominatim',
          total_amostras: 1
        }, { onConflict: 'estab_id,rua,bairro,cidade,modo_medicao' })
      }

      return Response.json({ ...resultado, totalAmostras: 1, origemCache: 'nominatim' })
    }

    return Response.json({ ok: false, error: 'Rota não calculada. Informe o km manualmente.' }, { status: 400 })

  } catch (error) {
    console.log('ERRO', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}