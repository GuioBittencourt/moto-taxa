export function calcularTaxa(km, bairroDestino, regras) {
  if (!regras) return { valor: 0, descricao: 'Sem regras configuradas' }

  let total = 0
  const detalhes = []

  // Taxa fixa por entrega
  if (regras.taxa_fixa_entrega && regras.taxa_fixa_entrega > 0) {
    total += regras.taxa_fixa_entrega
    detalhes.push(`Taxa fixa: R$${regras.taxa_fixa_entrega.toFixed(2)}`)
  }

  // Por bairro
  if (regras.tipo === 'bairro' && bairroDestino && regras.bairros?.length > 0) {
    const b = regras.bairros.find(x => x.nome.toLowerCase() === bairroDestino.toLowerCase())
    if (b) {
      total += b.valor
      detalhes.push(`Bairro ${b.nome}: R$${b.valor.toFixed(2)}`)
    } else {
      detalhes.push(`Bairro "${bairroDestino}" não encontrado`)
    }
    const minimo = regras.taxa_minima || 0
    if (minimo > 0 && total < minimo) {
      detalhes.push(`Mínimo aplicado: R$${minimo.toFixed(2)}`)
      total = minimo
    }
    return { valor: +total.toFixed(2), descricao: detalhes.join(' + ') }
  }

  // Por faixas de km
  if (km > 0 && regras.faixas_km?.length > 0) {
    const faixa = regras.faixas_km.find(f => km >= f.km_min && km <= f.km_max)
    if (faixa) {
      if (faixa.tipo === 'por_km') {
        // Arredonda o km para baixo antes de multiplicar, e o resultado final é redondo (sem centavos)
        const kmArredondado = Math.floor(km)
        const val = Math.floor(kmArredondado * faixa.valor)
        total += val
        detalhes.push(`${kmArredondado} km × R$${faixa.valor}/km = R$${val.toFixed(2)}`)
      } else {
        total += faixa.valor
        detalhes.push(`Faixa ${faixa.km_min}–${faixa.km_max} km = R$${faixa.valor.toFixed(2)} fixo`)
      }
    } else {
      detalhes.push(`${km.toFixed(1)} km fora das faixas`)
    }
  }

  // Excedente
  if (regras.excedente_km && km > regras.excedente_km.acima_de_km) {
    const exc = Math.floor(km - regras.excedente_km.acima_de_km)
    const extra = Math.floor(exc * regras.excedente_km.valor_extra)
    total += extra
    detalhes.push(`+${exc} km excedente × R$${regras.excedente_km.valor_extra} = R$${extra.toFixed(2)}`)
  }

  // Taxa mínima
  const minimo = regras.taxa_minima || 0
  if (minimo > 0 && total < minimo) {
    detalhes.push(`Mínimo aplicado: R$${minimo.toFixed(2)}`)
    total = minimo
  }

  return {
    valor: +total.toFixed(2),
    descricao: detalhes.length > 0 ? detalhes.join(' + ') : 'R$0'
  }
}

export function regrasPadrao() {
  return {
    tipo: 'km',
    taxa_fixa_entrega: 0,
    taxa_minima: 0,
    faixas_km: [
      { km_min: 1, km_max: 5, tipo: 'por_km', valor: 1 },
      { km_min: 6, km_max: 10, tipo: 'fixo', valor: 7 },
      { km_min: 11, km_max: 15, tipo: 'fixo', valor: 10 },
      { km_min: 16, km_max: 20, tipo: 'fixo', valor: 15 }
    ],
    excedente_km: null,
    bairros: []
  }
}
