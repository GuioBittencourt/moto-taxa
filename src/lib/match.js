import { supabase } from './supabase'

function normalizar(str) {
  return (str || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function nomesBatem(a, b) {
  const na = normalizar(a).split(' ').filter(p => p.length > 3)
  const nb = normalizar(b).split(' ').filter(p => p.length > 3)
  return na.filter(p => nb.includes(p)).length >= 2
}

function enderecosBatem(a, b) {
  const na = normalizar(a).replace(/[^a-z0-9 ]/g, '')
  const nb = normalizar(b).replace(/[^a-z0-9 ]/g, '')
  const palavras = na.split(' ').filter(p => p.length > 3)
  return palavras.filter(p => nb.includes(p)).length >= 2
}

function calcularStatusCheck(entA, entB) {
  if (!entB) return 'vermelho'
  const nomeOk = nomesBatem(entA.cliente || '', entB.cliente || '') ||
    normalizar(entA.cliente) === normalizar(entB.cliente)
  const endOk = enderecosBatem(
    entA.endereco_destino || entA.bairro_destino || '',
    entB.endereco_destino || entB.bairro_destino || ''
  )
  const valorOk = Math.abs((entA.taxa || 0) - (entB.taxa || 0)) < 0.01
  const kmDiff = Math.abs((entA.km || 0) - (entB.km || 0))
  if (!nomeOk || !endOk) return 'vermelho'
  if (!valorOk) return 'vermelho'
  if (kmDiff > 2) return 'amarelo'
  return 'verde'
}

export async function rodarMatch(turnoId) {
  const { data: todas } = await supabase
    .from('entregas').select('*').eq('turno_id', turnoId)
  if (!todas || todas.length === 0) return

  const doBoy = todas.filter(e => e.origem === 'boy')
  const daLoja = todas.filter(e => e.origem === 'loja')

  if (doBoy.length === 0 || daLoja.length === 0) {
    for (const e of todas) {
      await supabase.from('entregas').update({ par_id: null, status_check: 'vermelho' }).eq('id', e.id)
    }
    return
  }

  const usadosLoja = new Set()
  const pares = []

  for (const boy of doBoy) {
    let melhor = null
    let melhorScore = -1
    for (const loja of daLoja) {
      if (usadosLoja.has(loja.id)) continue
      const nomeOk = nomesBatem(boy.cliente || '', loja.cliente || '') ||
        normalizar(boy.cliente) === normalizar(loja.cliente)
      const endOk = enderecosBatem(
        boy.endereco_destino || boy.bairro_destino || '',
        loja.endereco_destino || loja.bairro_destino || ''
      )
      if (!nomeOk || !endOk) continue
      const score = (nomeOk ? 2 : 0) + (endOk ? 2 : 0) +
        (Math.abs((boy.taxa || 0) - (loja.taxa || 0)) < 0.01 ? 2 : 0)
      if (score > melhorScore) { melhor = loja; melhorScore = score }
    }
    if (melhor) {
      usadosLoja.add(melhor.id)
      const status = calcularStatusCheck(boy, melhor)
      pares.push({ boyId: boy.id, lojaId: melhor.id, status })
    } else {
      pares.push({ boyId: boy.id, lojaId: null, status: 'vermelho' })
    }
  }

  for (const loja of daLoja) {
    if (!usadosLoja.has(loja.id)) {
      pares.push({ boyId: null, lojaId: loja.id, status: 'vermelho' })
    }
  }

  for (const par of pares) {
    if (par.boyId && par.lojaId) {
      await supabase.from('entregas').update({ par_id: par.lojaId, status_check: par.status }).eq('id', par.boyId)
      await supabase.from('entregas').update({ par_id: par.boyId, status_check: par.status }).eq('id', par.lojaId)
    } else if (par.boyId) {
      await supabase.from('entregas').update({ par_id: null, status_check: 'vermelho' }).eq('id', par.boyId)
    } else if (par.lojaId) {
      await supabase.from('entregas').update({ par_id: null, status_check: 'vermelho' }).eq('id', par.lojaId)
    }
  }
}