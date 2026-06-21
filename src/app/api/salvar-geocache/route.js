import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function chaveNormalizada(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  if (ordenados.length % 2 === 0) {
    return +((ordenados[meio - 1] + ordenados[meio]) / 2).toFixed(1)
  }
  return ordenados[meio]
}

const MAX_AMOSTRAS = 5

export async function POST(request) {
  try {
    const { estabId, rua, bairro, cidade, modoMedicao, km } = await request.json()

    if (!estabId || !km || km <= 0) {
      return Response.json({ ok: false, error: 'Dados insuficientes' }, { status: 400 })
    }

    const buscaBairro = chaveNormalizada(bairro || '')
    const buscaRua = modoMedicao === 'bairro' ? null : chaveNormalizada(rua || '')
    const buscaCidade = chaveNormalizada(cidade || '')
    const modo = modoMedicao || 'rua'

    // 1. Insere a nova amostra
    await supabase.from('geocache_amostras').insert({
      estab_id: estabId,
      rua: buscaRua,
      bairro: buscaBairro,
      cidade: buscaCidade,
      modo_medicao: modo,
      km
    })

    // 2. Busca todas as amostras desse endereço, mais recentes primeiro
    let query = supabase.from('geocache_amostras').select('id, km, created_at')
      .eq('estab_id', estabId)
      .eq('modo_medicao', modo)
      .eq('bairro', buscaBairro)
      .eq('cidade', buscaCidade)
      .order('created_at', { ascending: false })

    query = buscaRua ? query.eq('rua', buscaRua) : query.is('rua', null)

    const { data: amostras } = await query

    if (!amostras || amostras.length === 0) {
      return Response.json({ ok: true })
    }

    // 3. Se passou do limite, apaga as mais antigas (FIFO)
    if (amostras.length > MAX_AMOSTRAS) {
      const idsParaApagar = amostras.slice(MAX_AMOSTRAS).map(a => a.id)
      await supabase.from('geocache_amostras').delete().in('id', idsParaApagar)
    }

    const amostrasAtuais = amostras.slice(0, MAX_AMOSTRAS)
    const kms = amostrasAtuais.map(a => a.km)
    const kmMediana = mediana(kms)

    // 4. Atualiza o cache principal com a mediana
    await supabase.from('geocache').upsert({
      estab_id: estabId,
      rua: buscaRua,
      bairro: buscaBairro,
      cidade: buscaCidade,
      modo_medicao: modo,
      km_calculado: kmMediana,
      duracao: null,
      origem: 'manual',
      total_amostras: amostrasAtuais.length
    }, { onConflict: 'estab_id,rua,bairro,cidade,modo_medicao' })

    return Response.json({ ok: true, kmMediana, totalAmostras: amostrasAtuais.length })
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}