'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CadastroEstabelecimento from './CadastroEstabelecimento'
import NovaEntrega from './NovaEntrega'

export default function BoyHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnoAtivo, setTurnoAtivo] = useState(null)
  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)
    const { data: vinculos } = await supabase
      .from('vinculos')
      .select('estab_id, estabelecimentos(*)')
      .eq('boy_id', perfil.id)
      .eq('ativo', true)
    const estabs = vinculos?.map(v => v.estabelecimentos) || []
    setEstabelecimentos(estabs)
    if (estabs.length > 0) setEstabAtivo(estabs[0])

    // Busca qualquer turno aberto — não só hoje
    const { data: turnos } = await supabase
      .from('turnos')
      .select('*')
      .eq('boy_id', perfil.id)
      .eq('status', 'aberto')
      .order('created_at', { ascending: false })
      .limit(1)

    const turno = turnos?.[0] || null
    if (turno) {
      setTurnoAtivo(turno)
      carregarEntregas(turno.id)
      // Sincroniza estab ativo com o do turno aberto
      if (estabs.length > 0) {
        const estabDoTurno = estabs.find(e => e.id === turno.estab_id)
        if (estabDoTurno) setEstabAtivo(estabDoTurno)
      }
    }
    setLoading(false)
  }

  async function carregarEntregas(turnoId) {
    const { data } = await supabase
      .from('entregas').select('*')
      .eq('turno_id', turnoId)
      .order('created_at', { ascending: false })
    setEntregas(data || [])
  }

  async function abrirTurno() {
    if (!estabAtivo) return
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('turnos').insert({
      boy_id: perfil.id, estab_id: estabAtivo.id, data: hoje,
      inicio: new Date().toISOString(),
      taxa_fixa_turno: estabAtivo.taxa_fixa_turno || 0,
      status: 'aberto'
    }).select().single()
    setTurnoAtivo(data); setEntregas([])
  }

  async function fecharTurno() {
    await supabase.from('turnos').update({
      status: 'fechado', fim: new Date().toISOString()
    }).eq('id', turnoAtivo.id)
    setTela('relatorio')
  }

  function formatarHora(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatarData(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const totalEntregas = entregas.reduce((s, e) => s + e.taxa, 0)
  const taxaFixa = turnoAtivo?.taxa_fixa_turno || estabAtivo?.taxa_fixa_turno || 0
  const totalComFixa = totalEntregas + taxaFixa

  if (tela === 'add-estab') return (
    <CadastroEstabelecimento
      userId={perfil.id}
      estabExistente={estabEditando}
      onSalvo={(e) => {
        if (estabEditando) {
          setEstabelecimentos(prev => prev.map(x => x.id === e.id ? e : x))
          setEstabAtivo(e)
        } else {
          setEstabelecimentos(prev => [...prev, e])
          setEstabAtivo(e)
        }
        setEstabEditando(null)
        setTela('home')
      }}
      onVoltar={() => { setEstabEditando(null); setTela('home') }}
    />
  )

  if (tela === 'nova-entrega') return (
    <NovaEntrega
      userId={perfil.id}
      estabelecimento={estabAtivo}
      turnoId={turnoAtivo?.id}
      onConfirmado={() => { carregarEntregas(turnoAtivo.id); setTela('home') }}
      onVoltar={() => setTela('home')}
    />
  )

  if (tela === 'relatorio') return (
    <Relatorio
      perfil={perfil}
      turno={turnoAtivo}
      estabelecimento={estabAtivo}
      entregas={entregas}
      onVoltar={() => setTela('home')}
      formatarHora={formatarHora}
      formatarData={formatarData}
    />
  )

  return (
    <div>
      {/* Banner topo */}
      <div style={{ position: 'relative', width: '100%', height: 110, overflow: 'hidden', background: '#000' }}>
        <img
          src="/logo-horizontal.png"
          alt="MotoTaxa"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.92 }}
        />
        {/* Badge e botão sair sobrepostos */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '0 1rem 10px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))'
        }}>
          <div>
            <span className="badge badge-boy">Motoboy</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{perfil.nome}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onLogout} style={{ marginTop: 0, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <div style={{ height: 12 }} />

        <div className="grid2">
          <div className="metric">
            <div className="metric-val yellow">R${totalEntregas.toFixed(2)}</div>
            <div className="metric-lbl">Entregas do turno</div>
          </div>
          <div className="metric">
            <div className="metric-val">{entregas.length}</div>
            <div className="metric-lbl">Corridas</div>
          </div>
        </div>

        <div className="card">
          <h2>Turno</h2>
          {estabelecimentos.length === 0 ? (
            <>
              <p className="muted" style={{ marginBottom: 12 }}>Nenhum estabelecimento cadastrado.</p>
              <button className="btn btn-primary" onClick={() => { setEstabEditando(null); setTela('add-estab') }}>+ Cadastrar estabelecimento</button>
            </>
          ) : (
            <>
              <label>Estabelecimento</label>
              <select value={estabAtivo?.id || ''} onChange={e => setEstabAtivo(estabelecimentos.find(x => x.id === e.target.value))}>
                {estabelecimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>

              {estabAtivo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {estabAtivo.endereco_saida}
                    {estabAtivo.taxa_fixa_turno > 0 && (
                      <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>+R${estabAtivo.taxa_fixa_turno}/turno</span>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: 11, marginTop: 0 }}
                    onClick={() => { setEstabEditando(estabAtivo); setTela('add-estab') }}
                  >
                    Editar
                  </button>
                </div>
              )}

              {!turnoAtivo ? (
                <button className="btn btn-primary" onClick={abrirTurno} style={{ marginTop: 12 }}>Iniciar turno</button>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                    Turno iniciado em {formatarData(turnoAtivo.inicio)} às {formatarHora(turnoAtivo.inicio)}
                  </div>
                  <div className="total-bar" style={{ marginTop: 8 }}>
                    <div className="total-bar-lbl">Total do turno</div>
                    <div className="total-bar-val">R${totalComFixa.toFixed(2)}</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setTela('nova-entrega')} style={{ marginTop: 8 }}>+ Registrar entrega</button>
                  <button className="btn btn-outline" onClick={fecharTurno}>Fechar turno</button>
                </>
              )}
              <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }} onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                + Outro estabelecimento
              </button>
            </>
          )}
        </div>

        {entregas.length > 0 && (
          <div className="card">
            <h2>Entregas do turno</h2>
            {entregas.map(e => (
              <div className="row" key={e.id}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{e.cliente}</div>
                  <div className="muted">
                    {e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}
                    {e.created_at && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>
                        {formatarHora(e.created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--yellow)', fontWeight: 600, fontSize: 15 }}>R${e.taxa.toFixed(2)}</div>
                  <div className="muted-sm">{e.status === 'pendente' ? 'aguardando' : 'confirmado'}</div>
                </div>
              </div>
            ))}
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>
              <span>Subtotal entregas</span>
              <span>R${totalEntregas.toFixed(2)}</span>
            </div>
            {taxaFixa > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>
                <span>Taxa fixa do turno</span>
                <span>R${taxaFixa.toFixed(2)}</span>
              </div>
            )}
            <button className="btn btn-outline" onClick={() => setTela('relatorio')} style={{ marginTop: 8 }}>Ver relatório</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Relatorio({ perfil, turno, estabelecimento, entregas, onVoltar, formatarHora, formatarData }) {
  const total = entregas.reduce((s, e) => s + e.taxa, 0)
  const fixa = turno?.taxa_fixa_turno || 0
  const grand = total + fixa
  const kmTotal = entregas.reduce((s, e) => s + (e.km || 0), 0)

  async function compartilhar() {
    const texto = `🏍️ MotoTaxa — Fechamento\n` +
      `📍 ${estabelecimento?.nome}\n` +
      `📅 ${turno?.inicio ? formatarData(turno.inicio) : new Date().toLocaleDateString('pt-BR')}\n\n` +
      entregas.map((e, i) => `#${i+1} ${e.cliente} — ${e.km > 0 ? e.km.toFixed(1)+'km' : e.bairro_destino} — R$${e.taxa.toFixed(2)}`).join('\n') +
      `\n\n` +
      (fixa > 0 ? `Taxa fixa: R$${fixa.toFixed(2)}\n` : '') +
      `Total: R$${grand.toFixed(2)}\n` +
      `Corridas: ${entregas.length} | KM: ${kmTotal.toFixed(1)}`

    if (navigator.share) {
      await navigator.share({ title: 'MotoTaxa — Fechamento', text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      alert('Relatório copiado! Cole no WhatsApp.')
    }
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Fechamento</h1>
      </div>

      <div className="card">
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 700 }}>{estabelecimento?.nome}</div>
          <div className="muted">
            {turno?.inicio ? `${formatarData(turno.inicio)} às ${formatarHora(turno.inicio)}` : new Date().toLocaleDateString('pt-BR')}
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 4 }}>
          <div class="metric"><div className="metric-val">{entregas.length}</div><div className="metric-lbl">Corridas</div></div>
          <div className="metric"><div className="metric-val">{kmTotal.toFixed(1)}</div><div className="metric-lbl">km entregues</div></div>
        </div>

        <div className="divider" />

        {entregas.map((e, i) => (
          <div className="row" key={e.id}>
            <div>
              <span className="muted-sm">#{i + 1} </span>
              <span style={{ fontWeight: 500 }}>{e.cliente}</span>
              <div className="muted">
                {e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}
                {e.created_at && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>
                    {formatarHora(e.created_at)}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</span>
          </div>
        ))}

        <div className="divider" />
        {fixa > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
            <span>Taxa fixa do turno</span><span>R${fixa.toFixed(2)}</span>
          </div>
        )}
        <div className="total-bar">
          <div className="total-bar-lbl">Total geral</div>
          <div className="total-bar-val">R${grand.toFixed(2)}</div>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={compartilhar}>
          Compartilhar via WhatsApp
        </button>
      </div>
    </div>
  )
}
