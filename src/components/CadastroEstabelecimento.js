'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = {
  km: {
    label: 'Por km',
    descricao: 'Maps calcula a distância real e aplica sua tabela de faixas.'
  },
  fixa: {
    label: 'Taxa fixa por entrega',
    descricao: 'Valor fixo igual para qualquer entrega, independente da distância.'
  },
  bairro: {
    label: 'Por bairro (valor fixo por bairro)',
    descricao: 'Para quem entrega em poucos bairros fixos. Você cadastra o valor de cada bairro manualmente.'
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
  const [bairroSaida, setBairroSaida] = useState(estabExistente?.bairro_saida || '')
  const [cidade, setCidade] = useState(estabExistente?.cidade || '')
  const [taxaFixaTurno, setTaxaFixaTurno] = useState(estabExistente?.taxa_fixa_turno || '')
  const [tipoCalculo, setTipoCalculo] = useState(estabExistente?.tipo_calculo || 'km')
  const [modeMedicao, setModeMedicao] = useState(estabExistente?.regras?.mode_medicao || 'rua')
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

  function adicionarFaixa() {
    const ultima = faixas[faixas.length - 1]
    const novoMin = ultima ? ultima.km_max + 1 : 1
    setFaixas([...faixas, { km_min: novoMin, km_max: novoMin + 4, tipo: 'fixo', valor: 0 }])
  }

  function removerFaixa(i) {
    if (faixas.length <= 1) return
    setFaixas(faixas.filter((_, j) => j !== i))
  }

  function atualizarFaixa(i, campo, valor) {
    const n = [...faixas]
    n[i] = { ...n[i], [campo]: campo === 'tipo' ? valor : parseFloat(valor) || 0 }
    setFaixas(n)
  }

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
    if (tipoCalculo === 'composta' && regrasIA) return { ...regrasIA, taxa_minima, mode_medicao: modeMedicao }
    if (tipoCalculo === 'fixa') return {
      tipo: 'fixa', taxa_fixa_entrega: parseFloat(taxaFixaEntrega) || 0,
      taxa_minima, mode_medicao: modeMedicao, faixas_km: [], bairros: [], excedente_km: null
    }
    if (tipoCalculo === 'bairro') return {
      tipo: 'bairro', taxa_fixa_entrega: 0, taxa_minima, mode_medicao: 'bairro',
      faixas_km: [],
      bairros: bairros.filter(b => b.nome && b.valor).map(b => ({ nome: b.nome, valor: parseFloat(b.valor) })),
      excedente_km: null
    }
    return {
      tipo: 'km', taxa_fixa_entrega: 0, taxa_minima,
      mode_medicao: modeMedicao,
      faixas_km: faixas, bairros: [], excedente_km: null
    }
  }

  async function salvar() {
    if (!nome.trim() || !endSaida.trim()) { setErro('Preencha nome e endereço'); return }
    if (!cidade.trim()) { setErro('Preencha a cidade'); return }
    if (modeMedicao === 'bairro' && !bairroSaida.trim()) {
      setErro('Preencha o bairro de saída para o modo bairro a bairro'); return
    }
    setSalvando(true); setErro('')
    const regras = montarRegras()
    const payload = {
      nome: nome.trim(),
      endereco_saida: endSaida.trim(),
      bairro_saida: bairroSaida.trim() || null,
      cidade: cidade.trim(),
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
      // Vínculo próprio — aceito dos dois lados automaticamente (boy usa para si mesmo)
      await supabase.from('vinculos').insert({
        boy_id: userId,
        estab_id: data.id,
        ativo: true,
        aceito_boy: true,
        aceito_loja: true
      })
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
          Editar as regras não afeta entregas já registradas.
        </div>
      )}

      <div className="card">
        <h2>Dados básicos</h2>
        <label>Nome do estabelecimento</label>
        <input placeholder="Ex: Alameda Pizzaria" value={nome} onChange={e => setNome(e.target.value)} />

        <label>Endereço de saída</label>
        <input
          placeholder="Ex: Rua João de Paula, 14"
          value={endSaida}
          onChange={e => setEndSaida(e.target.value.replace(/\s*-\s*.*/g, ''))}
        />
        <p className="muted-sm" style={{ marginTop: 4 }}>Só rua e número. Não inclua bairro ou cidade aqui.</p>

        <label>Bairro de saída</label>
        <input
          placeholder="Ex: Jardim América"
          value={bairroSaida}
          onChange={e => setBairroSaida(e.target.value)}
        />

        <label>Cidade</label>
        <input placeholder="Ex: São José dos Campos" value={cidade} onChange={e => setCidade(e.target.value)} />
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

      {tipoCalculo === 'km' && (
        <div className="card">
          <h2>Como medir a distância?</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              onClick={() => setModeMedicao('rua')}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                border: `1px solid ${modeMedicao === 'rua' ? 'var(--yellow)' : 'var(--border-2)'}`,
                background: modeMedicao === 'rua' ? 'var(--yellow-dim)' : 'var(--bg-2)'
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13, color: modeMedicao === 'rua' ? 'var(--yellow)' : 'var(--text)' }}>Rua a rua</div>
              <div className="muted-sm" style={{ marginTop: 3 }}>Endereço exato</div>
            </div>
            <div
              onClick={() => setModeMedicao('bairro')}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                border: `1px solid ${modeMedicao === 'bairro' ? 'var(--yellow)' : 'var(--border-2)'}`,
                background: modeMedicao === 'bairro' ? 'var(--yellow-dim)' : 'var(--bg-2)'
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13, color: modeMedicao === 'bairro' ? 'var(--yellow)' : 'var(--text)' }}>Bairro a bairro</div>
              <div className="muted-sm" style={{ marginTop: 3 }}>Centro do bairro</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            {modeMedicao === 'rua'
              ? 'Calcula do endereço exato de saída até o endereço exato de entrega.'
              : 'Calcula do bairro de saída até o bairro de entrega. Menos preciso, mais estável.'}
          </p>
          {modeMedicao === 'bairro' && !bairroSaida.trim() && (
            <p style={{ marginTop: 6, fontSize: 11, color: 'var(--yellow)' }}>
              ⚠ Preencha o bairro de saída nos dados básicos acima.
            </p>
          )}
        </div>
      )}

      {(tipoCalculo === 'km' || tipoCalculo === 'composta') && (
        <div className="card">
          <h2>Taxa mínima por entrega (opcional)</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Mesmo que o cálculo dê menos, o motoboy recebe no mínimo esse valor.
          </p>
          <label>Taxa mínima — R$</label>
          <input type="number" placeholder="Ex: 3.00" step="0.01" value={taxaMinima} onChange={e => setTaxaMinima(e.target.value)} />
        </div>
      )}

      {tipoCalculo === 'km' && (
        <div className="card">
          <h2>Tabela de faixas</h2>
          <p className="muted" style={{ marginBottom: 12 }}>Adicione ou remova faixas livremente.</p>
          {faixas.map((f, i) => (
            <div key={i} style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="muted-sm" style={{ marginBottom: 4 }}>De (km)</div>
                  <input type="number" step="0.1" value={f.km_min}
                    onChange={e => atualizarFaixa(i, 'km_min', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted-sm" style={{ marginBottom: 4 }}>Até (km)</div>
                  <input type="number" step="0.1" value={f.km_max}
                    onChange={e => atualizarFaixa(i, 'km_max', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted-sm" style={{ marginBottom: 4 }}>Valor R$</div>
                  <input type="number" step="0.01" value={f.valor}
                    onChange={e => atualizarFaixa(i, 'valor', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <select value={f.tipo} onChange={e => atualizarFaixa(i, 'tipo', e.target.value)}>
                    <option value="fixo">Valor fixo</option>
                    <option value="por_km">Por km</option>
                  </select>
                </div>
                {faixas.length > 1 && (
                  <button
                    className="btn btn-sm"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)', background: 'var(--red-dim)', marginTop: 0 }}
                    onClick={() => removerFaixa(i)}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}
          <button className="btn btn-outline" onClick={adicionarFaixa}>+ Adicionar faixa</button>
        </div>
      )}

      {tipoCalculo === 'bairro' && (
        <div className="card">
          <h2>Tabela por bairro</h2>
          <p className="muted" style={{ marginBottom: 10 }}>Para poucos bairros fixos com valor definido por bairro.</p>
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
            placeholder={'Ex: "R$5 fixo por entrega, mais R$2 se passar de 10km"\n"1-5km cobra R$1/km, 6-10km R$7 fixo"'}
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
