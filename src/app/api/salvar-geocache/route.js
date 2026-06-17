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

export async function POST(request) {
  try {
    const { estabId, rua, bairro, cidade, modoMedicao, km } = await request.json()

    if (!estabId || !km || km <= 0) {
      return Response.json({ ok: false, error: 'Dados insuficientes' }, { status: 400 })
    }

    const buscaBairro = chaveNormalizada(bairro || '')
    const buscaRua = modoMedicao === 'bairro' ? null : chaveNormalizada(rua || '')
    const buscaCidade = chaveNormalizada(cidade || '')

    await supabase.from('geocache').upsert({
      estab_id: estabId,
      rua: buscaRua,
      bairro: buscaBairro,
      cidade: buscaCidade,
      modo_medicao: modoMedicao || 'rua',
      km_calculado: km,
      duracao: null,
      origem: 'manual'
    }, { onConflict: 'estab_id,rua,bairro,cidade,modo_medicao' })

    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}