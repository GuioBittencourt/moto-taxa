'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { rodarMatch } from '../lib/match'
import CadastroEstabelecimento from './CadastroEstabelecimento'
import NovaEntrega from './NovaEntrega'

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

function corCheck(status) {
  if (status === 'verde') return '#22c55e'
  if (status === 'amarelo') return '#f59e0b'
  if (status === 'vermelho') return '#ef4444'
  return 'var(--text-3)'
}

function montarPares(entregas) {
  const boys = entregas.filter(e => e.origem === 'boy')
  const lojas = entregas.filter(e => e.origem === 'loja')
  const pares = []
  const lojasUsadas = new Set()
  for (const boy of boys) {
    const loja = boy.par_id ? lojas.find(l => l.id === boy.par_id) : null
    if (loja) lojasUsadas.add(loja.id)
    pares.push({ boy, loja: loja || null, status: boy.status_check })
  }
  for (const loja of lojas) {
    if (!lojasUsadas.has(loja.id)) {
      pares.push({ boy: null, loja, status: loja.status_check })
    }
  }
  return pares
}

function abrirRotaMaps(entregas, estabAtivo) {
  const pendentes = entregas.filter(e => e.origem === 'boy' && e.status_entrega !== 'concluida')
  if (pendentes.length === 0) return

  const cidade = estabAtivo?.cidade || 'São José dos Campos'
  const estado = 'SP'

  function montarEnderecoMaps(e) {
    const end = e.endereco_destino || e.bairro_destino || ''
    if (end.toLowerCase().includes(cidade.toLowerCase())) return `${end}, ${estado}, Brasil`
    return `${end}, ${cidade}, ${estado}, Brasil`
  }

  const origem = encodeURIComponent(
    estabAtivo?.endereco_saida
      ? `${estabAtivo.endereco_saida}, ${cidade}, ${estado}`
      : 'Minha localização'
  )

  if (pendentes.length === 1) {
    const dest = encodeURIComponent(montarEnderecoMaps(pendentes[0]))
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${dest}&travelmode=driving`, '_blank')
    return
  }

  // Múltiplos destinos — sem optimize:true (não suportado na URL web)
  // O Maps já organiza a rota na ordem passada
  const todosDestinos = pendentes.map(e => encodeURIComponent(montarEnderecoMaps(e))).join('|')
  const dest = encodeURIComponent(montarEnderecoMaps(pendentes[pendentes.length - 1]))
  const waypoints = pendentes.slice(0, -1).map(e => encodeURIComponent(montarEnderecoMaps(e))).join('|')

  window.open(
    `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${dest}&waypoints=${waypoints}&travelmode=driving`,
    '_blank'
  )
}

export default function BoyHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [meusEstabs, setMeusEstabs] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnoAtivo, setTurnoAtivo] = useState(null)
  const [entregas, setEntregas] = useState([])
  const [historicoTurnos, setHistoricoTurnos] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [turnoRelatorio, setTurnoRelatorio] = useState(null)
  const [entregasRelatorio, setEntregasRelatorio] = useState([])
  const [confirmandoApagarEstab, setConfirmandoApagarEstab] = useState(null)
  const [solicitandoFechamento, setSolicitandoFechamento] = useState(false)
  const [entregaEditando, setEntregaEditando] = useState(null)
  const [marcandoConcluida, setMarcandoConcluida] = useState(null)

  useEffect(() => { carregarDados() }, [])

  useEffect(() => {
    if (!turnoAtivo) return
    let ativo = true
    const poll = async () => {
      while (ativo) {
        await new Promise(r => setTimeout(r, 5000))
        if (!ativo) break
        const { data } = await supabase
          .from('turnos').select('*').eq('id', turnoAtivo.id).single()
        if (!data || !ativo) break
        setTurnoAtivo(data)
        if (data.status === 'fechado') {
          ativo = false
          await carregarHistorico()
          setTela('relatorio')
        }
      }
    }
    poll()
    return () => { ativo = false }
  }, [turnoAtivo?.id])

  async function detectarLojas(estabs) {
    const { data: perfisLoja } = await supabase
      .from('profiles').select('id').eq('tipo', 'estabelecimento')
    const idsLoja = (perfisLoja || []).map(p => p.id)
    if (idsLoja.length === 0) return
    const { data: lojas } = await supabase
      .from('estabelecimentos').select('id, nome, endereco_saida, criado_por')
      .in('criado_por', idsLoja)
    for (const meuEstab of (estabs || [])) {
      for (const loja of (lojas || [])) {
        if (!nomesBatem(loja.nome, meuEstab.nome)) continue
        if (!enderecosBatem(loja.endereco_saida, meuEstab.endereco_saida)) continue
        const { data: vincExist } = await supabase
          .from('vinculos').select('id')
          .eq('boy_id', perfil.id).eq('estab_id', loja.id).maybeSingle()
        if (!vincExist) {
          await supabase.from('vinculos').insert({
            boy_id: perfil.id, estab_id: loja.id,
            ativo: true, aceito_boy: true, aceito_loja: false
          })
        }
      }
    }
  }

  async function carregarDados() {
    setLoading(true)
    const { data: estabs } = await supabase
      .from('estabelecimentos').select('*').eq('criado_por', perfil.id)
    setMeusEstabs(estabs || [])
    if ((estabs || []).length > 0) await detectarLojas(estabs)

    const { data: vincs } = await supabase
      .from('vinculos').select('*, estabelecimentos(*)')
      .eq('boy_id', perfil.id).eq('ativo', true)
    setVinculos(vincs || [])

    const { data: turnos } = await supabase
      .from('turnos').select('*').eq('boy_id', perfil.id).eq('status', 'aberto')
      .order('created_at', { ascending: false }).limit(1)
    const turno = turnos?.[0] || null

    if (turno) {
      setTurnoAtivo(turno)
      const estabDoTurno = (estabs || []).find(e => e.id === turno.estab_id)
      if (estabDoTurno) setEstabAtivo(estabDoTurno)
      else if ((estabs || []).length > 0) setEstabAtivo((estabs || [])[0])
      await carregarEntregas(turno.id)
    } else {
      if ((estabs || []).length > 0) setEstabAtivo((estabs || [])[0])
    }

    await carregarHistorico()
    setLoading(false)
  }

  async function carregarHistorico() {
    const { data: hist } = await supabase
      .from('turnos').select('*').eq('boy_id', perfil.id).eq('status', 'fechado')
      .order('created_at', { ascending: false }).limit(20)
    setHistoricoTurnos(hist || [])
  }

  async function carregarEntregas(turnoId) {
    await rodarMatch(turnoId)
    const { data } = await supabase
      .from('entregas').select('*').eq('turno_id', turnoId)
      .order('created_at', { ascending: false })
    setEntregas(data || [])
  }

  async function marcarConcluida(entregaId) {
    setMarcandoConcluida(entregaId)
    await supabase.from('entregas').update({ status_entrega: 'concluida' }).eq('id', entregaId)
    setEntregas(prev => prev.map(e => e.id === entregaId ? { ...e, status_entrega: 'concluida' } : e))
    setMarcandoConcluida(null)
  }

  async function abrirTurno() {
    if (!estabAtivo) return
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('turnos').insert({
      boy_id: perfil.id, estab_id: estabAtivo.id, data: hoje,
      inicio: new Date().toISOString(),
      taxa_fixa_turno: estabAtivo.taxa_fixa_turno || 0,
      status: 'aberto', fechamento_boy: false, fechamento_loja: false
    }).select().single()
    setTurnoAtivo(data); setEntregas([])
  }

  async function solicitarFechamento() {
    setSolicitandoFechamento(true)
    await rodarMatch(turnoAtivo.id)
    const { data: ents } = await supabase
      .from('entregas').select('*').eq('turno_id', turnoAtivo.id)
    setEntregas(ents || [])

    const temVermelho = (ents || []).some(e => e.status_check === 'vermelho')
    if (temVermelho) {
      alert('Ainda há divergências em vermelho. Corrija antes de fechar o turno.')
      setSolicitandoFechamento(false)
      return
    }

    await supabase.from('turnos').update({ fechamento_boy: true }).eq('id', turnoAtivo.id)
    const { data: turnoAtualizado } = await supabase
      .from('turnos').select('*').eq('id', turnoAtivo.id).single()
    setTurnoAtivo(turnoAtualizado)

    if (turnoAtualizado.fechamento_loja) {
      await supabase.from('turnos').update({
        status: 'fechado', fim: new Date().toISOString()
      }).eq('id', turnoAtivo.id)
      await carregarHistorico()
      setTela('relatorio')
    }
    setSolicitandoFechamento(false)
  }

  async function apagarEstab(estabId) {
    setMeusEstabs(prev => prev.filter(e => e.id !== estabId))
    if (estabAtivo?.id === estabId) setEstabAtivo(null)
    setConfirmandoApagarEstab(null)
    const { data: turnosDoEstab } = await supabase.from('turnos').select('id')
      .eq('estab_id', estabId).eq('boy_id', perfil.id)
    for (const t of (turnosDoEstab || [])) {
      await supabase.from('entregas').delete().eq('turno_id', t.id)
    }
    await supabase.from('turnos').delete().eq('estab_id', estabId).eq('boy_id', perfil.id)
    await supabase.from('vinculos').delete().eq('estab_id', estabId).eq('boy_id', perfil.id)
    await supabase.from('convites').delete().eq('estab_id', estabId)
    await supabase.from('estabelecimentos').delete().eq('id', estabId).eq('criado_por', perfil.id)
    const { data: estabs } = await supabase.from('estabelecimentos').select('*').eq('criado_por', perfil.id)
    setMeusEstabs(estabs || [])
    if ((estabs || []).length > 0) setEstabAtivo(estabs[0])
  }

  async function aceitarVinculo(vincId) {
    await supabase.from('vinculos').update({ aceito_boy: true }).eq('id', vincId)
    await carregarDados()
  }

  async function recusarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false }).eq('id', vincId)
    await carregarDados()
  }

  async function encerrarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false }).eq('id', vincId)
    await carregarDados()
  }

  async function aoSalvarEstab(e) {
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

  const entregasBoy = entregas.filter(e => e.origem === 'boy')
  const entregasEmRota = entregasBoy.filter(e => e.status_entrega === 'em_rota')
  const totalEntregas = entregasBoy.reduce((s, e) => s + e.taxa, 0)
  const taxaFixa = turnoAtivo?.taxa_fixa_turno || estabAtivo?.taxa_fixa_turno || 0
  const totalComFixa = totalEntregas + taxaFixa
  const vincPendentes = vinculos.filter(v => v.aceito_loja && !v.aceito_boy)
  const vincAtivos = vinculos.filter(v => v.aceito_boy && v.aceito_loja)
  const turnoComDuploCheck = vincAtivos.length > 0 && turnoAtivo !== null
  const podeFechamento = turnoAtivo?.fechamento_boy
  const temEntregasEmRota = entregasEmRota.length > 0

  if (tela === 'add-estab') return (
    <CadastroEstabelecimento
      userId={perfil.id} estabExistente={estabEditando}
      onSalvo={aoSalvarEstab}
      onVoltar={() => { setEstabEditando(null); setTela('home') }}
    />
  )

  if (tela === 'nova-entrega' || tela === 'editar-entrega') return (
    <NovaEntrega
      userId={perfil.id} estabelecimento={estabAtivo} turnoId={turnoAtivo?.id}
      entregaExistente={tela === 'editar-entrega' ? entregaEditando : null}
      onConfirmado={async () => { setEntregaEditando(null); await carregarEntregas(turnoAtivo.id); setTela('home') }}
      onVoltar={() => { setEntregaEditando(null); setTela('home') }}
    />
  )

  if (tela === 'relatorio') return (
    <Relatorio perfil={perfil} turno={turnoAtivo} estabelecimento={estabAtivo}
      entregas={entregasBoy}
      onVoltar={() => { setTurnoAtivo(null); setEntregas([]); setTela('home') }}
      formatarHora={formatarHora} formatarData={formatarData} />
  )

  if (tela === 'relatorio-historico') return (
    <Relatorio perfil={perfil} turno={turnoRelatorio}
      estabelecimento={meusEstabs.find(e => e.id === turnoRelatorio?.estab_id)}
      entregas={entregasRelatorio.filter(e => e.origem === 'boy')}
      onVoltar={() => setTela('historico')}
      formatarHora={formatarHora} formatarData={formatarData} />
  )

  if (tela === 'historico') return (
    <Historico perfil={perfil} turnos={historicoTurnos} estabelecimentos={meusEstabs}
      onVoltar={() => setTela('home')}
      onVerRelatorio={async (turno) => {
        const { data } = await supabase.from('entregas').select('*')
          .eq('turno_id', turno.id).order('created_at', { ascending: true })
        setTurnoRelatorio(turno); setEntregasRelatorio(data || [])
        setTela('relatorio-historico')
      }}
      onApagarTurno={async (turnoId) => {
        await supabase.from('entregas').delete().eq('turno_id', turnoId)
        await supabase.from('turnos').delete().eq('id', turnoId)
        await carregarHistorico()
      }}
      formatarData={formatarData} formatarHora={formatarHora} />
  )

  if (tela === 'vinculos') return (
    <GerenciarVinculos
      vincAtivos={vincAtivos} vincPendentes={vincPendentes}
      onAceitar={aceitarVinculo} onRecusar={recusarVinculo} onEncerrar={encerrarVinculo}
      onVoltar={() => setTela('home')} />
  )

  if (tela === 'gerenciar-estabs') return (
    <GerenciarEstabs
      estabs={meusEstabs} turnoAtivoEstabId={turnoAtivo?.estab_id}
      confirmandoApagar={confirmandoApagarEstab}
      onConfirmarApagar={setConfirmandoApagarEstab}
      onApagar={apagarEstab}
      onEditar={(estab) => { setEstabEditando(estab); setTela('add-estab') }}
      onVoltar={() => setTela('home')} />
  )

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height: 110, overflow: 'hidden', background: '#000' }}>
        <img src="/logo-horizontal.png" alt="MotoTaxa"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.92 }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '0 1rem 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))'
        }}>
          <div>
            <span className="badge badge-boy">Motoboy</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{perfil.nome}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onLogout}
            style={{ marginTop: 0, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>Sair</button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <div style={{ height: 12 }} />

        {vincPendentes.length > 0 && (
          <div className="alert alert-info" style={{ marginBottom: 12, cursor: 'pointer' }}
            onClick={() => setTela('vinculos')}>
            <strong>🔗 {vincPendentes.length} solicitação{vincPendentes.length > 1 ? 'ões' : ''} de vínculo</strong>
            <div style={{ fontSize: 12, marginTop: 2 }}>Toque para ver e aceitar</div>
          </div>
        )}

        {temEntregasEmRota && (
          <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--yellow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>🏍️ Em rota ({entregasEmRota.length})</h2>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 0, fontSize: 12 }}
                onClick={() => abrirRotaMaps(entregas, estabAtivo)}>
                Abrir no Maps
              </button>
            </div>
            {entregasEmRota.map(e => (
              <div key={e.id} className="row" style={{ alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{e.cliente}</div>
                  <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${e.taxa.toFixed(2)}</span>
                  <button
                    style={{
                      background: 'var(--green)', border: 'none', borderRadius: 6,
                      color: '#fff', fontWeight: 700, fontSize: 13, padding: '6px 12px', cursor: 'pointer',
                      opacity: marcandoConcluida === e.id ? 0.6 : 1
                    }}
                    disabled={marcandoConcluida === e.id}
                    onClick={() => marcarConcluida(e.id)}>
                    {marcandoConcluida === e.id ? '...' : '✓'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid2">
          <div className="metric">
            <div className="metric-val yellow">R${totalEntregas.toFixed(2)}</div>
            <div className="metric-lbl">Minhas entregas</div>
          </div>
          <div className="metric">
            <div className="metric-val">{entregasBoy.length}</div>
            <div className="metric-lbl">Corridas</div>
          </div>
        </div>

        <div className="card">
          <h2>Turno</h2>
          {meusEstabs.length === 0 ? (
            <>
              <p className="muted" style={{ marginBottom: 12 }}>Nenhum estabelecimento cadastrado.</p>
              <button className="btn btn-primary" onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                + Cadastrar estabelecimento
              </button>
            </>
          ) : (
            <>
              <label>Estabelecimento</label>
              <select value={estabAtivo?.id || ''}
                onChange={e => setEstabAtivo(meusEstabs.find(x => x.id === e.target.value))}>
                {meusEstabs.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
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
                    onClick={() => { setEstabEditando(estabAtivo); setTela('add-estab') }}>Editar</button>
                </div>
              )}

              {!turnoAtivo ? (
                <>
                  <button className="btn btn-primary" onClick={abrirTurno} style={{ marginTop: 12 }}>Iniciar turno</button>
                  {historicoTurnos.length > 0 && (
                    <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                      onClick={() => setTela('historico')}>Ver histórico de turnos</button>
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
                  {turnoComDuploCheck ? (
                    podeFechamento ? (
                      <div className="alert alert-info" style={{ marginTop: 8 }}>
                        Aguardando confirmação do estabelecimento para fechar.
                      </div>
                    ) : (
                      <button className="btn btn-outline" onClick={solicitarFechamento}
                        disabled={solicitandoFechamento} style={{ marginTop: 4 }}>
                        {solicitandoFechamento ? <><span className="spinner"></span>Verificando...</> : 'Solicitar fechamento'}
                      </button>
                    )
                  ) : (
                    <button className="btn btn-outline" onClick={async () => {
                      await supabase.from('turnos').update({ status: 'fechado', fim: new Date().toISOString() }).eq('id', turnoAtivo.id)
                      await carregarHistorico(); setTela('relatorio')
                    }}>Fechar turno</button>
                  )}
                  <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                    + Outro estabelecimento
                  </button>
                  <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() => setTela('gerenciar-estabs')}>
                    Gerenciar estabelecimentos ({meusEstabs.length})
                  </button>
                  {vincAtivos.length > 0 && (
                    <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                      onClick={() => setTela('vinculos')}>
                      Vínculos ativos ({vincAtivos.length})
                    </button>
                  )}
                </>
              )}
              {!turnoAtivo && (
                <>
                  <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
                    + Outro estabelecimento
                  </button>
                  <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() => setTela('gerenciar-estabs')}>
                    Gerenciar estabelecimentos ({meusEstabs.length})
                  </button>
                  {vincAtivos.length > 0 && (
                    <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                      onClick={() => setTela('vinculos')}>
                      Vínculos ativos ({vincAtivos.length})
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {entregas.length > 0 && (
          <div className="card">
            <h2>Entregas do turno</h2>
            {turnoComDuploCheck ? (
              <>
                <p className="muted" style={{ marginBottom: 8, fontSize: 11 }}>
                  Verde = conferido · Amarelo = divergência leve · Vermelho = divergência
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', paddingLeft: 4 }}>BOY</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', paddingLeft: 4 }}>LOJA</div>
                </div>
                {montarPares(entregas).map((par, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6,
                    borderLeft: `3px solid ${corCheck(par.status)}`, paddingLeft: 6
                  }}>
                    <div
                      onClick={() => { if (par.boy) { setEntregaEditando(par.boy); setTela('editar-entrega') } }}
                      style={{
                        background: 'var(--bg-2)', borderRadius: 6, padding: '6px 8px',
                        cursor: par.boy ? 'pointer' : 'default',
                        opacity: par.boy ? 1 : 0.35, minHeight: 54
                      }}>
                      {par.boy ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{par.boy.cliente}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {par.boy.km > 0 ? par.boy.km.toFixed(1) + ' km' : par.boy.bairro_destino}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--yellow)' }}>R${par.boy.taxa.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>toque para editar</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }}>— não lançado</div>
                      )}
                    </div>
                    <div style={{
                      background: 'var(--bg-2)', borderRadius: 6, padding: '6px 8px',
                      opacity: par.loja ? 0.75 : 0.35, minHeight: 54
                    }}>
                      {par.loja ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{par.loja.cliente}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {par.loja.km > 0 ? par.loja.km.toFixed(1) + ' km' : par.loja.bairro_destino}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>R${par.loja.taxa.toFixed(2)}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }}>— não lançado</div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              entregas.map(e => (
                <div className="row" key={e.id}
                  onClick={() => { if (e.origem === 'boy') { setEntregaEditando(e); setTela('editar-entrega') } }}
                  style={{
                    cursor: e.origem === 'boy' ? 'pointer' : 'default',
                    opacity: e.status_entrega === 'concluida' ? 0.5 : 1
                  }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {e.status_entrega === 'concluida' && <span style={{ color: 'var(--green)', marginRight: 4 }}>✓</span>}
                      {e.cliente}
                    </div>
                    <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
                  </div>
                  <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${e.taxa.toFixed(2)}</div>
                </div>
              ))
            )}
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>
              <span>Subtotal (minhas)</span><span>R${totalEntregas.toFixed(2)}</span>
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

function GerenciarEstabs({ estabs, turnoAtivoEstabId, confirmandoApagar, onConfirmarApagar, onApagar, onEditar, onVoltar }) {
  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Estabelecimentos</h1>
      </div>
      {estabs.map(e => (
        <div className="card" key={e.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{e.nome}</div>
              <div className="muted">{e.endereco_saida} · {e.cidade}</div>
            </div>
            <button className="btn btn-sm btn-outline" style={{ marginTop: 0, fontSize: 11 }}
              onClick={() => onEditar(e)}>Editar</button>
          </div>
          {turnoAtivoEstabId === e.id ? (
            <p className="muted-sm" style={{ marginTop: 8 }}>Turno ativo — não é possível apagar agora.</p>
          ) : confirmandoApagar === e.id ? (
            <div className="alert alert-warn" style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Apagar este estabelecimento e todo o histórico?</div>
              <div style={{ fontSize: 12, marginBottom: 10 }}>Esta ação não pode ser desfeita.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm"
                  style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={() => onApagar(e.id)}>Sim, apagar</button>
                <button className="btn btn-sm btn-outline" style={{ flex: 1, marginTop: 0 }}
                  onClick={() => onConfirmarApagar(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-outline"
              style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={() => onConfirmarApagar(e.id)}>Apagar estabelecimento</button>
          )}
        </div>
      ))}
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
            <div key={v.id}>
              <div style={{ fontWeight: 500 }}>{v.estabelecimentos?.nome}</div>
              <div className="muted" style={{ marginBottom: 8 }}>{v.estabelecimentos?.endereco_saida} · {v.estabelecimentos?.cidade}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn btn-primary" style={{ flex: 1, marginTop: 0, fontSize: 13 }}
                  onClick={() => onAceitar(v.id)}>Aceitar</button>
                <button className="btn btn-outline"
                  style={{ flex: 1, marginTop: 0, fontSize: 13, color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => onRecusar(v.id)}>Recusar</button>
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
          <div key={v.id}>
            <div style={{ fontWeight: 500 }}>{v.estabelecimentos?.nome}</div>
            <div className="muted" style={{ marginBottom: 8 }}>{v.estabelecimentos?.endereco_saida} · {v.estabelecimentos?.cidade}</div>
            {confirmandoEncerrar === v.id ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn btn-sm"
                  style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={() => { onEncerrar(v.id); setConfirmandoEncerrar(null) }}>Confirmar saída</button>
                <button className="btn btn-sm btn-outline" style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setConfirmandoEncerrar(null)}>Cancelar</button>
              </div>
            ) : (
              <button className="btn btn-outline"
                style={{ fontSize: 12, marginTop: 0, marginBottom: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={() => setConfirmandoEncerrar(v.id)}>Encerrar vínculo</button>
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
      `🏍️ MotoTaxa — Fechamento\n📍 ${estabelecimento?.nome}\n` +
      `📅 ${turno?.inicio ? formatarData(turno.inicio) : new Date().toLocaleDateString('pt-BR')}\n\n` +
      entregas.map((e, i) => `#${i + 1} ${e.cliente} — ${e.km > 0 ? e.km.toFixed(1) + 'km' : e.bairro_destino} — R$${e.taxa.toFixed(2)}`).join('\n') +
      `\n\n${fixa > 0 ? `Taxa fixa: R$${fixa.toFixed(2)}\n` : ''}Total: R$${grand.toFixed(2)}\nCorridas: ${entregas.length} | KM: ${kmTotal.toFixed(1)}`
    if (navigator.share) await navigator.share({ title: 'MotoTaxa — Fechamento', text: texto })
    else { await navigator.clipboard.writeText(texto); alert('Relatório copiado! Cole no WhatsApp.') }
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
          <div className="muted">{turno?.inicio ? `${formatarData(turno.inicio)} às ${formatarHora(turno.inicio)}` : new Date().toLocaleDateString('pt-BR')}</div>
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
                {e.created_at && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{formatarHora(e.created_at)}</span>}
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
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={compartilhar}>Compartilhar via WhatsApp</button>
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
              <div style={{ color: 'var(--yellow)', fontWeight: 600, fontSize: 15 }}>R${(t.taxa_fixa_turno || 0).toFixed(2)}</div>
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
