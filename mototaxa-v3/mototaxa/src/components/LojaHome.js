'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CadastroEstabelecimento from './CadastroEstabelecimento'

export default function LojaHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [turnosHoje, setTurnosHoje] = useState([])
  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)
    const { data: estabs } = await supabase.from('estabelecimentos').select('*').eq('criado_por', perfil.id)
    setEstabelecimentos(estabs || [])
    if (estabs?.length > 0) { setEstabAtivo(estabs[0]); await carregarMovimento(estabs[0].id) }
    setLoading(false)
  }

  async function carregarMovimento(estabId) {
    const hoje = new Date().toISOString().split('T')[0]
    const { data: turnos } = await supabase.from('turnos').select('*, profiles(nome)').eq('estab_id', estabId).eq('data', hoje)
    setTurnosHoje(turnos || [])
    const ids = (turnos || []).map(t => t.id)
    if (ids.length > 0) {
      const { data: ents } = await supabase.from('entregas').select('*').in('turno_id', ids).order('created_at', { ascending: false })
      setEntregas(ents || [])
    } else setEntregas([])
  }

  async function aprovarEntrega(id) {
    await supabase.from('entregas').update({ status: 'confirmado' }).eq('id', id)
    setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: 'confirmado' } : e))
  }

  const totalCusto = entregas.reduce((s, e) => s + e.taxa, 0)
  const pendentes = entregas.filter(e => e.status === 'pendente')

  if (tela === 'add-estab') return (
    <CadastroEstabelecimento
      userId={perfil.id}
      onSalvo={(e) => { setEstabelecimentos(p => [...p, e]); setEstabAtivo(e); carregarMovimento(e.id); setTela('home') }}
      onVoltar={() => setTela('home')}
    />
  )

  return (
    <div style={{ padding: '0 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0 0.75rem' }}>
        <div>
          <span className="badge badge-loja">Estabelecimento</span>
          <h1 style={{ marginTop: 6 }}>{estabAtivo?.nome || perfil.nome}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <img src="/logo-escudo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <button className="btn btn-sm btn-outline" onClick={onLogout}>Sair</button>
        </div>
      </div>

      {estabelecimentos.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ marginBottom: 12 }}>Configure seu estabelecimento para começar.</p>
          <button className="btn btn-primary" onClick={() => setTela('add-estab')}>+ Configurar estabelecimento</button>
        </div>
      ) : (
        <>
          <div className="grid2">
            <div className="metric">
              <div className="metric-val yellow">R${totalCusto.toFixed(2)}</div>
              <div className="metric-lbl">Custo hoje</div>
            </div>
            <div className="metric">
              <div className="metric-val">{entregas.length}</div>
              <div className="metric-lbl">Entregas</div>
            </div>
          </div>

          {/* Motoboys */}
          <div className="card">
            <h2>Motoboys hoje</h2>
            {turnosHoje.length === 0 ? (
              <p className="muted">Nenhum turno aberto hoje</p>
            ) : turnosHoje.map(t => {
              const entsT = entregas.filter(e => e.turno_id === t.id)
              const totT = entsT.reduce((s, e) => s + e.taxa, 0)
              return (
                <div className="row" key={t.id}>
                  <span style={{ fontWeight: 500 }}>{t.profiles?.nome}</span>
                  <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{entsT.length} entregas · R${totT.toFixed(2)}</span>
                </div>
              )
            })}
          </div>

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <div className="card">
              <h2>Pendentes de aprovação</h2>
              {pendentes.map(e => (
                <div className="row" key={e.id}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{e.cliente}</div>
                    <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</span>
                    <button className="btn btn-sm" style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)', marginTop: 0 }} onClick={() => aprovarEntrega(e.id)}>Aprovar</button>
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
                    <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</div>
                    <div className="muted-sm">{e.status === 'confirmado' ? 'confirmado' : 'pendente'}</div>
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div className="total-bar">
                <div className="total-bar-lbl">Total do dia</div>
                <div className="total-bar-val">R${totalCusto.toFixed(2)}</div>
              </div>
              <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => alert('PDF: relatório por motoboy')}>Gerar relatório</button>
            </div>
          )}

          <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setTela('add-estab')}>+ Cadastrar outro estabelecimento</button>
        </>
      )}
    </div>
  )
}
