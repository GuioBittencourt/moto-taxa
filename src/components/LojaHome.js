'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CadastroEstabelecimento from './CadastroEstabelecimento'

export default function LojaHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnosAtivos, setTurnosAtivos] = useState([])
  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)
    const { data: estabs } = await supabase
      .from('estabelecimentos').select('*').eq('criado_por', perfil.id)
    setEstabelecimentos(estabs || [])
    if (estabs?.length > 0) {
      setEstabAtivo(estabs[0])
      await carregarMovimento(estabs[0].id)
    }
    setLoading(false)
  }

  async function carregarMovimento(estabId) {
    // Busca turnos abertos de qualquer data
    const { data: turnos } = await supabase
      .from('turnos')
      .select('*, profiles(nome)')
      .eq('estab_id', estabId)
      .eq('status', 'aberto')
      .order('created_at', { ascending: false })
    setTurnosAtivos(turnos || [])

    const ids = (turnos || []).map(t => t.id)
    if (ids.length > 0) {
      const { data: ents } = await supabase
        .from('entregas').select('*')
        .in('turno_id', ids)
        .order('created_at', { ascending: false })
      setEntregas(ents || [])
    } else setEntregas([])
  }

  async function aprovarEntrega(id) {
    await supabase.from('entregas').update({ status: 'confirmado' }).eq('id', id)
    setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: 'confirmado' } : e))
  }

  function formatarHora(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatarData(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const totalCusto = entregas.reduce((s, e) => s + e.taxa, 0)
  const pendentes = entregas.filter(e => e.status === 'pendente')

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
        carregarMovimento(e.id)
        setTela('home')
      }}
      onVoltar={() => { setEstabEditando(null); setTela('home') }}
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
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '0 1rem 10px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))'
        }}>
          <div>
            <span className="badge badge-loja">Estabelecimento</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{estabAtivo?.nome || perfil.nome}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onLogout} style={{ marginTop: 0, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <div style={{ height: 12 }} />

        {estabelecimentos.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ marginBottom: 12 }}>Configure seu estabelecimento para começar.</p>
            <button className="btn btn-primary" onClick={() => { setEstabEditando(null); setTela('add-estab') }}>+ Configurar estabelecimento</button>
          </div>
        ) : (
          <>
            {estabelecimentos.length > 1 && (
              <div className="card">
                <label>Estabelecimento</label>
                <select value={estabAtivo?.id || ''} onChange={e => {
                  const es = estabelecimentos.find(x => x.id === e.target.value)
                  setEstabAtivo(es)
                  carregarMovimento(es.id)
                }}>
                  {estabelecimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
            )}

            <div className="grid2">
              <div className="metric">
                <div className="metric-val yellow">R${totalCusto.toFixed(2)}</div>
                <div className="metric-lbl">Custo total</div>
              </div>
              <div className="metric">
                <div className="metric-val">{entregas.length}</div>
                <div className="metric-lbl">Entregas</div>
              </div>
            </div>

            {/* Motoboys com turnos ativos */}
            <div className="card">
              <h2>Motoboys ativos</h2>
              {turnosAtivos.length === 0 ? (
                <p className="muted">Nenhum turno aberto no momento</p>
              ) : turnosAtivos.map(t => {
                const entsT = entregas.filter(e => e.turno_id === t.id)
                const totT = entsT.reduce((s, e) => s + e.taxa, 0)
                return (
                  <div className="row" key={t.id}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{t.profiles?.nome}</span>
                      <div className="muted-sm">desde {formatarData(t.inicio)} {formatarHora(t.inicio)}</div>
                    </div>
                    <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{entsT.length} entregas · R${totT.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            {/* Pendentes de aprovação */}
            {pendentes.length > 0 && (
              <div className="card">
                <h2>Pendentes de aprovação</h2>
                {pendentes.map(e => (
                  <div className="row" key={e.id}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{e.cliente}</div>
                      <div className="muted">
                        {e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{formatarHora(e.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</span>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)', marginTop: 0 }}
                        onClick={() => aprovarEntrega(e.id)}
                      >Aprovar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Todas as entregas */}
            {entregas.length > 0 && (
              <div className="card">
                <h2>Todas as entregas</h2>
                {entregas.map(e => (
                  <div className="row" key={e.id}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{e.cliente}</div>
                      <div className="muted">
                        {e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{formatarHora(e.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</div>
                      <div className="muted-sm">{e.status === 'confirmado' ? 'confirmado' : 'pendente'}</div>
                    </div>
                  </div>
                ))}
                <div className="divider" />
                <div className="total-bar">
                  <div className="total-bar-lbl">Total geral</div>
                  <div className="total-bar-val">R${totalCusto.toFixed(2)}</div>
                </div>
                <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => alert('Relatório: em breve')}>Gerar relatório</button>
              </div>
            )}

            {estabAtivo && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={() => { setEstabEditando(estabAtivo); setTela('add-estab') }}>
                  Editar estabelecimento
                </button>
                <button className="btn btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                  + Outro
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
