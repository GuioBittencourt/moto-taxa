'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = {
  km: {
    label: 'Por km — endereço completo',
    descricao: 'Calcula pela rota real do endereço de entrega. Você define faixas de distância com valores.'
  },
  bairro: {
    label: 'Por bairro',
    descricao: 'Você cadastra um valor fixo por bairro de destino. Sem precisar informar km.'
  },
  fixa: {
    label: 'Taxa fixa por entrega',
    descricao: 'Valor fixo igual para qualquer entrega, independente da distância.'
  },
  composta: {
    label: 'Regras livres',
    descricao: 'Descreva em texto como funciona e a IA monta as regras automaticamente.'
  }
}

export default function CadastroEstabelecimento({ userId, onSalvo, onVoltar, estabExistente }) {
  const editando = !!estabExistente

  const [nome, setNome] = useState(estabExistente?.nome || '')
  const [endSaida, setEndSaida] = useState(estabExistente?.endereco_saida || '')
  const [taxaFixaTurno, setTaxaFixaTurno] = useState(estabExistente?.taxa_fixa_turno || '')
  const [tipoCalculo, setTipoCalculo] = useState(estabExistente?.tipo_calculo || 'km')
  const [taxaMinima, setTaxaMinima] = useState(estabExistente?.regras?.taxa_minima || '')
  const [textoRegras, setTextoRegras] = useState('')
  const [regrasIA, setRegrasIA] = useState(null)
  const [interpretando, setInterpretando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [bairros, setBairros] = useState(
    estabExistente?.regras?.bairros?.length > 0
      ? estabExistente.regras.bairros
      : [{ nome: '', valor: '' }]
  )
  const [taxaFixaEntrega, setTaxaFixaEntrega] = useState(
    estabExistente?.regras?.taxa_fixa_entrega || ''
  )
  const [faixas, setFaixas] = useState(
    estabExistente?.regras?.faixas_km?.length > 0
      ? estabExistente.regras.faixas_km
      : [
          { km_min: 1, km_max: 5, tipo: 'por_km', valor: 1 },
          { km_min: 6, km_max: 10, tipo: 'fixo', valor: 7 },
          { km_min: 11, km_max: 15, tipo: 'fixo', valor: 10 },
          { km_min: 16, km_max: 20, tipo: 'fixo', valor: 15 },
        ]
  )

  async function interpretarRegras() {
    if (!textoRegras.trim()) return
    setInterpretando(true); setErro('')
    try {
      const resp = await fetch('/api/interpretar-regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoRegras })
      })
      const data = await resp.json()
      if (data.ok) setRegrasIA(data.data)
      else setErro('Não consegui interpretar. Tente ser mais específico.')
    } catch { setErro('Erro de conexão') }
    setInterpretando(false)
  }

  function montarRegras() {
    const taxa_minima = parseFloat(taxaMinima) || 0
    if (tipoCalculo === 'composta' && regrasIA) return { ...regrasIA, taxa_minima }
    if (tipoCalculo === 'fixa') return {
      tipo: 'fixa', taxa_fixa_entrega: parseFloat(taxaFixaEntrega) || 0,
      taxa_minima, faixas_km: [], bairros: [], excedente_km: null
    }
    if (tipoCalculo === 'bairro') return {
      tipo: 'bairro', taxa_fixa_entrega: 0, taxa_minima, faixas_km: [],
      bairros: bairros.filter(b => b.nome && b.valor).map(b => ({ nome: b.nome, valor: parseFloat(b.valor) })),
      excedente_km: null
    }
    return { tipo: 'km', taxa_fixa_entrega: 0, taxa_minima, faixas_km: faixas, bairros: [], excedente_km: null }
  }

  async function salvar() {
    if (!nome.trim() || !endSaida.trim()) { setErro('Preencha nome e endereço'); return }
    setSalvando(true); setErro('')
    const regras = montarRegras()
    const payload = {
      nome: nome.trim(), endereco_saida: endSaida.trim(),
      taxa_fixa_turno: parseFloat(taxaFixaTurno) || 0,
      tipo_calculo: tipoCalculo, regras
    }

    if (editando) {
      const { data, error } = await supabase
        .from('estabelecimentos').update(payload)
        .eq('id', estabExistente.id).select().single()
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
      onSalvo(data)
    } else {
      const { data, error } = await supabase
        .from('estabelecimentos').insert({ ...payload, criado_por: userId })
        .select().single()
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
      await supabase.from('vinculos').insert({ boy_id: userId, estab_id: data.id })
      onSalvo(data)
    }
    setSalvando(false)
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>{editando ? 'Editar estabelecimento' : 'Novo estabelecimento'}</h1>
      </div>

      {editando && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          Editar as regras não afeta entregas já registradas — o histórico é preservado.
        </div>
      )}

      <div className="card">
        <h2>Dados básicos</h2>
        <label>Nome</label>
        <input placeholder="Ex: Alameda Pizzaria" value={nome} onChange={e => setNome(e.target.value)} />
        <label>Endereço de saída</label>
        <input placeholder="Ex: Rua João de Paula, 14 - SJC" value={endSaida} onChange={e => setEndSaida(e.target.value)} />
        <label>Taxa fixa de turno — R$ (opcional)</label>
        <input type="number" placeholder="Ex: 60.00" step="0.01" value={taxaFixaTurno} onChange={e => setTaxaFixaTurno(e.target.value)} />
      </div>

      <div className="card">
        <h2>Como é calculada a taxa por entrega?</h2>
        {Object.entries(TIPOS).map(([key, info]) => (
          <div
            key={key}
            onClick={() => { setTipoCalculo(key); setRegrasIA(null) }}
            style={{
              border: `1px solid ${tipoCalculo === key ? 'var(--yellow)' : 'var(--border-2)'}`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
              background: tipoCalculo === key ? 'var(--yellow-dim)' : 'var(--bg-2)'
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 14, color: tipoCalculo === key ? 'var(--yellow)' : 'var(--text)' }}>
              {info.label}
            </div>
            <div className="muted" style={{ marginTop: 3 }}>{info.descricao}</div>
          </div>
        ))}
      </div>

      {(tipoCalculo === 'km' || tipoCalculo === 'composta' || tipoCalculo === 'bairro') && (
        <div className="card">
          <h2>Taxa mínima por entrega (opcional)</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Valor mínimo garantido. Ex: R$3,00 — mesmo que o cálculo dê menos, o motoboy recebe no mínimo esse valor.
          </p>
          <label>Taxa mínima — R$</label>
          <input type="number" placeholder="Ex: 3.00" step="0.01" value={taxaMinima} onChange={e => setTaxaMinima(e.target.value)} />
        </div>
      )}

      {tipoCalculo === 'km' && (
        <div className="card">
          <h2>Faixas de distância</h2>
          {faixas.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', width: 72, flexShrink: 0 }}>{f.km_min}–{f.km_max} km</span>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>R$</span>
              <input type="number" step="0.01" value={f.valor} style={{ width: 80 }}
                onChange={e => { const n = [...faixas]; n[i] = { ...n[i], valor: parseFloat(e.target.value) || 0 }; setFaixas(n) }} />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{f.tipo === 'por_km' ? '/km' : 'fixo'}</span>
            </div>
          ))}
        </div>
      )}

      {tipoCalculo === 'bairro' && (
        <div className="card">
          <h2>Tabela por bairro</h2>
          {bairros.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input placeholder="Bairro" value={b.nome} style={{ flex: 2 }}
                onChange={e => { const n = [...bairros]; n[i] = { ...n[i], nome: e.target.value }; setBairros(n) }} />
              <input type="number" placeholder="R$" step="0.01" value={b.valor} style={{ flex: 1 }}
                onChange={e => { const n = [...bairros]; n[i] = { ...n[i], valor: e.target.value }; setBairros(n) }} />
              {bairros.length > 1 && (
                <button className="btn btn-sm"
                  style={{ color: 'var(--red)', borderColor: 'var(--red)', background: 'var(--red-dim)', marginTop: 0, padding: '6px 10px' }}
                  onClick={() => setBairros(bairros.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          <button className="btn btn-outline" onClick={() => setBairros([...bairros, { nome: '', valor: '' }])}>+ Bairro</button>
        </div>
      )}

      {tipoCalculo === 'fixa' && (
        <div className="card">
          <h2>Taxa fixa por entrega</h2>
          <label>Valor por entrega — R$</label>
          <input type="number" placeholder="Ex: 8.00" step="0.01" value={taxaFixaEntrega} onChange={e => setTaxaFixaEntrega(e.target.value)} />
        </div>
      )}

      {tipoCalculo === 'composta' && (
        <div className="card">
          <h2>Descreva as regras <span className="ai-tag">IA</span></h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Escreva como funciona a precificação e a IA monta automaticamente.
          </p>
          <textarea
            placeholder={'Exemplos:\n"R$5 fixo por entrega, mais R$2 se passar de 10km"\n"1-5km cobra R$1/km, 6-10km R$7 fixo"\n"Bairro Centro R$7, Vila Nair R$8"'}
            value={textoRegras} onChange={e => setTextoRegras(e.target.value)}
          />
          <button className="btn btn-primary" onClick={interpretarRegras} disabled={interpretando || !textoRegras.trim()}>
            {interpretando ? <><span className="spinner"></span>Interpretando...</> : 'Interpretar com IA'}
          </button>
          {regrasIA && (
            <div className="alert alert-ok" style={{ marginTop: 10 }}>
              <strong>IA interpretou:</strong><br />{regrasIA.resumo}
              <button className="btn btn-outline" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setRegrasIA(null)}>Refazer</button>
            </div>
          )}
        </div>
      )}

      {erro && <div className="alert alert-warn">{erro}</div>}

      <button className="btn btn-primary" onClick={salvar}
        disabled={salvando || (tipoCalculo === 'composta' && !regrasIA)}>
        {salvando ? <><span className="spinner"></span>Salvando...</> : editando ? 'Salvar alterações' : 'Salvar estabelecimento'}
      </button>
    </div>
  )
}
