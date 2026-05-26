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
  const [historicoTurnos, setHistoricoTurnos] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [turnoRelatorio, setTurnoRelatorio] = useState(null)
  const [entregasRelatorio, setEntregasRelatorio] = useState([])

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)

    // Busca vínculos ativos e pendentes
    const { data: vincs } = await supabase
      .from('vinculos')
      .select('*, estabelecimentos(*)')
      .eq('boy_id', perfil.id)
    setVinculos(vincs || [])

    const ativos = (vincs || []).filter(v => v.ativo && v.aceito_boy && v.aceito_loja)
    const estabs = ativos.map(v => v.estabelecimentos)
    setEstabelecimentos(estabs)

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
      const estabDoTurno = estabs.find(e => e.id === turno.estab_id)
      if (estabDoTurno) setEstabAtivo(estabDoTurno)
      else if (estabs.length > 0) setEstabAtivo(estabs[0])

      const { data: ents } = await supabase
        .from('entregas').select('*')
        .eq('turno_id', turno.id)
        .order('created_at', { ascending: false })
      setEntregas(ents || [])
    } else {
      if (estabs.length > 0) setEstabAtivo(estabs[0])
    }

    await carregarHistorico()
    setLoading(false)
  }

  async function carregarHistorico() {
    const { data: hist } = await supabase
      .from('turnos').select('*')
      .eq('boy_id', perfil.id)
      .eq('status', 'fechado')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistoricoTurnos(hist || [])
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
    await carregarHistorico()
    setTela('relatorio')
  }

  async function aceitarVinculo(vincId) {
    await supabase.from('vinculos').update({ aceito_boy: true }).eq('id', vincId)
    await carregarDados()
  }

  async function recusarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false, aceito_boy: false }).eq('id', vincId)
    await carregarDados()
  }

  async function encerrarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false }).eq('id', vincId)
    await carregarDados()
  }

  // Ao cadastrar estab, verifica match automático com lojas já cadastradas
  async function aoSalvarEstab(e) {
    // Busca loja cadastrada com nome+endereço parecido
    const { data: matches } = await supabase
      .from('estabelecimentos')
      .select('*')
      .ilike('nome', `%${e.nome.split(' ')[0]}%`)
      .neq('criado_por', perfil.id)

    const match = matches?.find(m =>
      m.nome.toLowerCase().trim() === e.nome.toLowerCase().trim() &&
      m.endereco_saida.toLowerCase().trim() === e.endereco_saida.toLowerCase().trim()
    )

    if (match) {
      // Verifica se vínculo já existe
      const { data: vincExist } = await supabase
        .from('vinculos')
        .select('id')
        .eq('boy_id', perfil.id)
        .eq('estab_id', match.id)
        .single()

      if (!vincExist) {
        await supabase.from('vinculos').insert({
          boy_id: perfil.id,
          estab_id: match.id,
          ativo: true,
          aceito_boy: true,
          aceito_loja: false
        })
      }
    }

    if (estabEditando) {
      setEstabelecimentos(prev => prev.map(x => x.id === e.id ? e : x))
      setEstabAtivo(e)
    } else {
      setEstabelecimentos(prev => [...prev, e])
      setEstabAtivo(e)
    }
    setEstabEditando(null)
    setTela('home')
    await carregarDados()
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

  const vincPendentes = vinculos.filter(v => v.ativo && v.aceito_loja && !v.aceito_boy)
  const vincAtivos = vinculos.filter(v => v.ativo && v.aceito_boy && v.aceito_loja)

  if (tela === 'add-estab') return (
    <CadastroEstabelecimento
      userId={perfil.id}
      estabExistente={estabEditando}
      onSalvo={aoSalvarEstab}
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
      onVoltar={() => { setTurnoAtivo(null); setEntregas([]); setTela('home') }}
      formatarHora={formatarHora}
      formatarData={formatarData}
    />
  )

  if (tela === 'relatorio-historico') return (
    <Relatorio
      perfil={perfil}
      turno={turnoRelatorio}
      estabelecimento={estabelecimentos.find(e => e.id === turnoRelatorio?.estab_id)}
      entregas={entregasRelatorio}
      onVoltar={() => setTela('historico')}
      formatarHora={formatarHora}
      formatarData={formatarData}
    />
  )

  if (tela === 'historico') return (
    <Historico
      perfil={perfil}
      turnos={historicoTurnos}
      estabelecimentos={estabelecimentos}
      onVoltar={() => setTela('home')}
      onVerRelatorio={async (turno) => {
        const { data } = await supabase
          .from('entregas').select('*')
          .eq('turno_id', turno.id)
          .order('created_at', { ascending: true })
        setTurnoRelatorio(turno)
        setEntregasRelatorio(data || [])
        setTela('relatorio-historico')
      }}
      onApagarTurno={async (turnoId) => {
        await supabase.from('entregas').delete().eq('turno_id', turnoId)
        await supabase.from('turnos').delete().eq('id', turnoId)
        await carregarHistorico()
      }}
      formatarData={formatarData}
      formatarHora={formatarHora}
    />
  )

  if (tela === 'vinculos') return (
    <GerenciarVinculos
      vincAtivos={vincAtivos}
      vincPendentes={vincPendentes}
      onAceitar={aceitarVinculo}
      onRecusar={recusarVinculo}
      onEncerrar={encerrarVinculo}
      onVoltar={() => setTela('home')}
    />
  )

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height: 110, overflow: 'hidden', background: '#000' }}>
        <img src="/logo-horizontal.png" alt="MotoTaxa"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.92 }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '0 1rem 10px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))'
        }}>
          <div>
            <span className="badge badge-boy">Motoboy</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{perfil.nome}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onLogout}
            style={{ marginTop: 0, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <div style={{ height: 12 }} />

        {/* Notificação de vínculos pendentes */}
        {vincPendentes.length > 0 && (
          <div className="alert alert-info" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => setTela('vinculos')}>
            <strong>🔗 {vincPendentes.length} solicitação{vincPendentes.length > 1 ? 'ões' : ''} de vínculo</strong>
            <div style={{ fontSize: 12, marginTop: 2 }}>Toque para ver e aceitar</div>
          </div>
        )}

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
              <button className="btn btn-primary" onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                + Cadastrar estabelecimento
              </button>
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
                  <button className="btn btn-sm btn-outline" style={{ fontSize: 11, marginTop: 0 }}
                    onClick={() => { setEstabEditando(estabAtivo); setTela('add-estab') }}>
                    Editar
                  </button>
                </div>
              )}

              {!turnoAtivo ? (
                <>
                  <button className="btn btn-primary" onClick={abrirTurno} style={{ marginTop: 12 }}>Iniciar turno</button>
                  {historicoTurnos.length > 0 && (
                    <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setTela('historico')}>
                      Ver histórico de turnos
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                    Iniciado em {formatarData(turnoAtivo.inicio)} às {formatarHora(turnoAtivo.inicio)}
                  </div>
                  <div className="total-bar" style={{ marginTop: 8 }}>
                    <div className="total-bar-lbl">Total do turno</div>
                    <div className="total-bar-val">R${totalComFixa.toFixed(2)}</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setTela('nova-entrega')} style={{ marginTop: 8 }}>
                    + Registrar entrega
                  </button>
                  <button className="btn btn-outline" onClick={fecharTurno}>Fechar turno</button>
                </>
              )}
              <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                + Outro estabelecimento
              </button>
              <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                onClick={() => setTela('vinculos')}>
                Gerenciar vínculos {vincAtivos.length > 0 ? `(${vincAtivos.length})` : ''}
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
              <span>Subtotal entregas</span><span>R${totalEntregas.toFixed(2)}</span>
            </div>
            {taxaFixa > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>
                <span>Taxa fixa do turno</span><span>R${taxaFixa.toFixed(2)}</span>
              </div>
            )}
            <button className="btn btn-outline" onClick={() => setTela('relatorio')} style={{ marginTop: 8 }}>Ver relatório</button>
          </div>
        )}
      </div>
    </div>
  )
}

function GerenciarVinculos({ vincAtivos, vincPendentes, onAceitar, onRecusar, onEncerrar, onVoltar }) {
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(null)

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Vínculos</h1>
      </div>

      {vincPendentes.length > 0 && (
        <div className="card">
          <h2>Solicitações pendentes</h2>
          {vincPendentes.map(v => (
            <div key={v.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 500 }}>{v.estabelecimentos?.nome}</div>
              <div className="muted" style={{ marginBottom: 8 }}>{v.estabelecimentos?.endereco_saida} · {v.estabelecimentos?.cidade}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, marginTop: 0, fontSize: 13 }}
                  onClick={() => onAceitar(v.id)}>
                  Aceitar
                </button>
                <button className="btn btn-outline" style={{ flex: 1, marginTop: 0, fontSize: 13, color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => onRecusar(v.id)}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Vínculos ativos</h2>
        {vincAtivos.length === 0 ? (
          <p className="muted">Nenhum vínculo ativo.</p>
        ) : vincAtivos.map(v => (
          <div key={v.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 500 }}>{v.estabelecimentos?.nome}</div>
            <div className="muted" style={{ marginBottom: 8 }}>{v.estabelecimentos?.endereco_saida} · {v.estabelecimentos?.cidade}</div>
            {confirmandoEncerrar === v.id ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={() => { onEncerrar(v.id); setConfirmandoEncerrar(null) }}>
                  Confirmar saída
                </button>
                <button className="btn btn-sm btn-outline" style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setConfirmandoEncerrar(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="btn btn-outline" style={{ fontSize: 12, marginTop: 0, color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={() => setConfirmandoEncerrar(v.id)}>
                Encerrar vínculo
              </button>
            )}
          </div>
        ))}
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
    const texto =
      `🏍️ MotoTaxa — Fechamento\n` +
      `📍 ${estabelecimento?.nome}\n` +
      `📅 ${turno?.inicio ? formatarData(turno.inicio) : new Date().toLocaleDateString('pt-BR')}\n\n` +
      entregas.map((e, i) =>
        `#${i + 1} ${e.cliente} — ${e.km > 0 ? e.km.toFixed(1) + 'km' : e.bairro_destino} — R$${e.taxa.toFixed(2)}`
      ).join('\n') +
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
        <div className="grid2">
          <div className="metric"><div className="metric-val">{entregas.length}</div><div className="metric-lbl">Corridas</div></div>
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

function Historico({ perfil, turnos, estabelecimentos, onVoltar, onVerRelatorio, onApagarTurno, formatarData, formatarHora }) {
  const [confirmandoApagar, setConfirmandoApagar] = useState(null)
  const [apagando, setApagando] = useState(false)

  async function confirmarApagar(turnoId) {
    setApagando(true)
    await onApagarTurno(turnoId)
    setConfirmandoApagar(null)
    setApagando(false)
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Histórico de turnos</h1>
      </div>
      {turnos.length === 0 && <p className="muted">Nenhum turno fechado ainda.</p>}
      {turnos.map(t => {
        const es = estabelecimentos.find(e => e.id === t.estab_id)
        const esteConfirmando = confirmandoApagar === t.id
        return (
          <div className="card" key={t.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 500 }}>{es?.nome || 'Estabelecimento'}</div>
                <div className="muted">{formatarData(t.inicio)} · {formatarHora(t.inicio)}</div>
                {t.fim && <div className="muted-sm">até {formatarHora(t.fim)}</div>}
              </div>
              <div style={{ color: 'var(--yellow)', fontWeight: 600, fontSize: 15 }}>
                R${(t.taxa_fixa_turno || 0).toFixed(2)}
              </div>
            </div>
            {!esteConfirmando ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-outline" style={{ flex: 1, marginTop: 0, fontSize: 13 }}
                  onClick={() => onVerRelatorio(t)}>Ver relatório</button>
                <button className="btn btn-outline"
                  style={{ marginTop: 0, fontSize: 13, color: 'var(--red)', borderColor: 'var(--red)', padding: '8px 14px' }}
                  onClick={() => setConfirmandoApagar(t.id)}>Apagar</button>
              </div>
            ) : (
              <div className="alert alert-warn" style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>Apagar este turno e todas as entregas?</div>
                <div style={{ fontSize: 12, marginBottom: 10 }}>Esta ação não pode ser desfeita.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                    onClick={() => confirmarApagar(t.id)} disabled={apagando}>
                    {apagando ? <span className="spinner"></span> : 'Sim, apagar'}
                  </button>
                  <button className="btn btn-sm btn-outline" style={{ flex: 1, marginTop: 0 }}
                    onClick={() => setConfirmandoApagar(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}