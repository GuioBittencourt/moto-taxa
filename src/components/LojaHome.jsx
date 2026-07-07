'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CadastroEstabelecimento from './CadastroEstabelecimento'
import NovaEntrega from './NovaEntrega'
import { rodarMatch } from '../lib/match'
import OnboardingModal, { useOnboarding } from './OnboardingModal'

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

export default function LojaHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [turnoAtivo, setTurnoAtivo] = useState(null)
  const [entregas, setEntregas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [historicoTurnos, setHistoricoTurnos] = useState([])
  const [linkConvite, setLinkConvite] = useState('')
  const [gerandoLink, setGerandoLink] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fechando, setFechando] = useState(false)
  const [fechandoId, setFechandoId] = useState(null)
  const [entregaEditando, setEntregaEditando] = useState(null)
  const [abrindoTurno, setAbrindoTurno] = useState(false)
  const [nomeTurno, setNomeTurno] = useState('')
  const [turnoRelatorio, setTurnoRelatorio] = useState(null)
  const [entregasRelatorio, setEntregasRelatorio] = useState([])
  const onboarding = useOnboarding(perfil.id)

  useEffect(() => { carregarDados() }, [])

  useEffect(() => {
    if (!turnoAtivo?.id) return
    const id = turnoAtivo.id
    let rodando = true
    ;(async () => {
      while (rodando) {
        await new Promise(r => setTimeout(r, 5000))
        if (!rodando) break
        const { data } = await supabase
          .from('turnos').select('*').eq('id', id).single()
        if (!data || !rodando) break
        setTurnoAtivo(prev => ({ ...prev, ...data }))
        if (data.status === 'fechado') {
          rodando = false
          await carregarTurnos(estabAtivo.id)
          break
        }
      }
    })()
    return () => { rodando = false }
  }, [turnoAtivo?.id])

  async function detectarECriarSolicitacoes(estab) {
    const { data: perfisBoy } = await supabase
      .from('profiles').select('id').eq('tipo', 'boy')
    const idsBoy = (perfisBoy || []).map(p => p.id)
    if (idsBoy.length === 0) return
    const { data: estabsBoys } = await supabase
      .from('estabelecimentos').select('id, nome, endereco_saida, criado_por')
      .in('criado_por', idsBoy)
    for (const e of (estabsBoys || [])) {
      if (!nomesBatem(e.nome, estab.nome)) continue
      if (!enderecosBatem(e.endereco_saida, estab.endereco_saida)) continue
      const { data: vincExist } = await supabase
        .from('vinculos').select('id')
        .eq('boy_id', e.criado_por).eq('estab_id', estab.id).maybeSingle()
      if (!vincExist) {
        await supabase.from('vinculos').insert({
          boy_id: e.criado_por, estab_id: estab.id,
          ativo: true, aceito_boy: true, aceito_loja: false
        })
      }
    }
  }

  async function carregarDados() {
    setLoading(true)
    const { data: estabs } = await supabase
      .from('estabelecimentos').select('*').eq('criado_por', perfil.id)
    setEstabelecimentos(estabs || [])
    if (estabs?.length > 0) {
      setEstabAtivo(estabs[0])
      await carregarVinculos(estabs[0].id)
      await carregarTurnos(estabs[0].id)
      await carregarHistorico(estabs[0].id)
      await detectarECriarSolicitacoes(estabs[0])
    }
    setLoading(false)
  }

  async function carregarTurnos(estabId) {
    const { data: turnosLoja } = await supabase
      .from('turnos').select('*')
      .eq('estab_id', estabId)
      .eq('boy_id', perfil.id)
      .eq('status', 'aberto')
      .order('created_at', { ascending: false })

    const { data: vincs } = await supabase
      .from('vinculos').select('boy_id')
      .eq('estab_id', estabId).eq('ativo', true)
      .eq('aceito_boy', true).eq('aceito_loja', true)
    const boyIds = (vincs || []).map(v => v.boy_id)

    let turnosBoy = []
    if (boyIds.length > 0) {
      const { data } = await supabase
        .from('turnos').select('*, profiles(nome)')
        .in('boy_id', boyIds).eq('status', 'aberto')
        .order('created_at', { ascending: false })
      turnosBoy = data || []
    }

    const todos = [...(turnosLoja || []), ...turnosBoy]
    setTurnos(todos)
  }

  async function carregarHistorico(estabId) {
    const id = estabId || estabAtivo?.id
    if (!id) return
    const { data } = await supabase
      .from('turnos').select('*')
      .eq('estab_id', id)
      .eq('status', 'fechado')
      .order('created_at', { ascending: false })
      .limit(30)
    setHistoricoTurnos(data || [])
  }

  async function carregarEntregas(turnoId) {
    await rodarMatch(turnoId)
    const { data } = await supabase
      .from('entregas').select('*').eq('turno_id', turnoId)
      .order('created_at', { ascending: false })
    setEntregas(data || [])
  }

  async function carregarVinculos(estabId) {
    const { data } = await supabase
      .from('vinculos').select('*, profiles(nome, email)')
      .eq('estab_id', estabId)
    setVinculos(data || [])
  }

  async function abrirTurno() {
    if (!nomeTurno.trim()) return
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('turnos').insert({
      boy_id: perfil.id,
      estab_id: estabAtivo.id,
      data: hoje,
      inicio: new Date().toISOString(),
      taxa_fixa_turno: estabAtivo.taxa_fixa_turno || 0,
      status: 'aberto',
      fechamento_boy: false,
      fechamento_loja: false,
      nome_turno: nomeTurno.trim()
    }).select().single()
    setNomeTurno('')
    setAbrindoTurno(false)
    await carregarTurnos(estabAtivo.id)
    if (data) { setTurnoAtivo(data); await carregarEntregas(data.id); setTela('turno') }
  }

  async function fecharTurno(turnoParam) {
    const turno = turnoParam || turnoAtivo
    if (!turno) return
    setFechando(true)
    setFechandoId(turno.id)
    const isLoja = turno.boy_id === perfil.id

    if (isLoja) {
      await supabase.from('turnos').update({
        status: 'fechado', fim: new Date().toISOString()
      }).eq('id', turno.id)
      const { data: ents } = await supabase.from('entregas').select('*').eq('turno_id', turno.id)
      setTurnoRelatorio(turno)
      setEntregasRelatorio(ents || [])
      await carregarTurnos(estabAtivo.id)
      await carregarHistorico(estabAtivo.id)
      setFechando(false)
      setFechandoId(null)
      setTela('relatorio')
      return
    }

    const { data: ents } = await supabase.from('entregas').select('*').eq('turno_id', turno.id)
    const temVermelho = (ents || []).some(e => e.status_check === 'vermelho')
    if (temVermelho) {
      alert('Ainda há divergências em vermelho. Corrija antes de fechar.')
      setFechando(false)
      setFechandoId(null)
      return
    }

    await supabase.from('turnos').update({ fechamento_loja: true }).eq('id', turno.id)
    const { data: turnoAtualizado } = await supabase
      .from('turnos').select('*').eq('id', turno.id).single()
    if (turnoAtualizado && turnoAtivo?.id === turno.id) {
      setTurnoAtivo(prev => ({ ...prev, ...turnoAtualizado }))
    }

    if (turnoAtualizado?.fechamento_boy) {
      await supabase.from('turnos').update({
        status: 'fechado', fim: new Date().toISOString()
      }).eq('id', turno.id)
      await carregarHistorico(estabAtivo.id)
    }
    await carregarTurnos(estabAtivo.id)
    setFechando(false)
    setFechandoId(null)
  }

  async function gerarLinkConvite() {
    if (!estabAtivo) return
    setGerandoLink(true)
    const { data: convExist } = await supabase
      .from('convites').select('codigo')
      .eq('estab_id', estabAtivo.id).eq('status', 'pendente').eq('tipo', 'link')
      .maybeSingle()
    let codigo = convExist?.codigo
    if (!codigo) {
      const { data: novo } = await supabase
        .from('convites').insert({ estab_id: estabAtivo.id, criado_por: perfil.id, tipo: 'link' })
        .select('codigo').single()
      codigo = novo?.codigo
    }
    setLinkConvite(`${window.location.origin}/convite/${codigo}`)
    setGerandoLink(false)
  }

  async function compartilharLink() {
    if (navigator.share) {
      await navigator.share({ title: 'Convite MotoTaxa', text: `Entre no MotoTaxa e se vincule à ${estabAtivo?.nome}: ${linkConvite}` })
    } else {
      await navigator.clipboard.writeText(linkConvite)
      alert('Link copiado!')
    }
  }

  async function aceitarVinculo(vincId) {
    await supabase.from('vinculos').update({ aceito_loja: true }).eq('id', vincId)
    await carregarVinculos(estabAtivo.id)
    await carregarTurnos(estabAtivo.id)
  }

  async function encerrarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false }).eq('id', vincId)
    await carregarVinculos(estabAtivo.id)
    await carregarTurnos(estabAtivo.id)
  }

  function nomeTurnoDisplay(turno) {
    if (turno.nome_turno) return turno.nome_turno
    if (turno.profiles?.nome) return turno.profiles.nome
    return 'Motoboy'
  }

  function isTurnoLoja(turno) {
    return turno.boy_id === perfil.id
  }

  function formatarHora(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatarData(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const vincPendentes = vinculos.filter(v => v.ativo && v.aceito_boy && !v.aceito_loja)
  const vincAtivos = vinculos.filter(v => v.ativo && v.aceito_boy && v.aceito_loja)
  const entregasLoja = entregas.filter(e => e.origem === 'loja')
  const entregasBoy = entregas.filter(e => e.origem === 'boy')
  const totalCusto = turnoAtivo && isTurnoLoja(turnoAtivo)
    ? entregasLoja.reduce((s, e) => s + e.taxa, 0)
    : entregasBoy.reduce((s, e) => s + e.taxa, 0)
  const temVermelho = entregas.some(e => e.status_check === 'vermelho')
  const turnoComDuploCheck = turnoAtivo && !isTurnoLoja(turnoAtivo)
  const hojeStr = new Date().toDateString()
  const turnosAntigos = turnos.filter(t => new Date(t.inicio).toDateString() !== hojeStr)

  if (tela === 'add-estab') return (
    <CadastroEstabelecimento
      userId={perfil.id}
      estabExistente={estabEditando}
      onSalvo={async (e) => {
        if (estabEditando) {
          setEstabelecimentos(prev => prev.map(x => x.id === e.id ? e : x))
          setEstabAtivo(e)
        } else {
          setEstabelecimentos(prev => [...prev, e])
          setEstabAtivo(e)
          await detectarECriarSolicitacoes(e)
        }
        setEstabEditando(null)
        await carregarTurnos(e.id)
        await carregarVinculos(e.id)
        setTela('home')
      }}
      onVoltar={() => { setEstabEditando(null); setTela('home') }}
    />
  )

  if ((tela === 'nova-entrega' || tela === 'editar-entrega') && turnoAtivo) return (
    <NovaEntrega
      userId={isTurnoLoja(turnoAtivo) ? perfil.id : turnoAtivo.boy_id}
      estabelecimento={estabAtivo}
      turnoId={turnoAtivo.id}
      entregaExistente={tela === 'editar-entrega' ? entregaEditando : null}
      origemOverride="loja"
      onConfirmado={async () => { setEntregaEditando(null); await carregarEntregas(turnoAtivo.id); setTela('turno') }}
      onVoltar={() => { setEntregaEditando(null); setTela('turno') }}
    />
  )

  if (tela === 'relatorio') return (
    <Relatorio
      turno={turnoRelatorio} estabelecimento={estabAtivo}
      entregas={entregasRelatorio}
      onVoltar={() => { setTurnoAtivo(null); setEntregas([]); setTela('home') }}
      formatarHora={formatarHora} formatarData={formatarData}
    />
  )

  if (tela === 'relatorio-historico') return (
    <Relatorio
      turno={turnoRelatorio} estabelecimento={estabAtivo}
      entregas={entregasRelatorio}
      onVoltar={() => setTela('historico')}
      formatarHora={formatarHora} formatarData={formatarData}
    />
  )

  if (tela === 'historico') return (
    <Historico
      turnos={historicoTurnos}
      onVoltar={() => setTela('home')}
      onVerRelatorio={async (turno) => {
        const { data } = await supabase.from('entregas').select('*')
          .eq('turno_id', turno.id).order('created_at', { ascending: true })
        setTurnoRelatorio(turno)
        setEntregasRelatorio(data || [])
        setTela('relatorio-historico')
      }}
      onApagarTurno={async (turnoId) => {
        await supabase.from('entregas').delete().eq('turno_id', turnoId)
        await supabase.from('turnos').delete().eq('id', turnoId)
        await carregarHistorico(estabAtivo.id)
      }}
      nomeTurnoDisplay={nomeTurnoDisplay}
      formatarData={formatarData} formatarHora={formatarHora}
    />
  )

  if (tela === 'vinculos') return (
    <GerenciarVinculosLoja
      vincAtivos={vincAtivos} vincPendentes={vincPendentes}
      onAceitar={aceitarVinculo} onEncerrar={encerrarVinculo}
      onVoltar={() => setTela('home')} />
  )

  if (tela === 'turno' && turnoAtivo) return (
    <div>
      <div style={{ padding: '0 1rem' }}>
        <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
          <button className="back-btn" onClick={() => { setTurnoAtivo(null); setEntregas([]); setTela('home') }}>←</button>
          <h1>{nomeTurnoDisplay(turnoAtivo)}</h1>
        </div>

        <div className="grid2">
          <div className="metric">
            <div className="metric-val yellow">R${totalCusto.toFixed(2)}</div>
            <div className="metric-lbl">Total do turno</div>
          </div>
          <div className="metric">
            <div className="metric-val">{entregas.filter(e => isTurnoLoja(turnoAtivo) ? e.origem === 'loja' : e.origem === 'boy').length}</div>
            <div className="metric-lbl">Entregas</div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
            Iniciado em {formatarData(turnoAtivo.inicio)} às {formatarHora(turnoAtivo.inicio)}
            {isTurnoLoja(turnoAtivo) && <span style={{ marginLeft: 8, color: 'var(--yellow)', fontSize: 11 }}>· turno da loja</span>}
          </div>
          <button className="btn btn-primary" onClick={() => setTela('nova-entrega')} style={{ marginBottom: 4 }}>
            + Registrar entrega
          </button>

          {isTurnoLoja(turnoAtivo) ? (
            <button className="btn btn-outline" onClick={() => fecharTurno()} disabled={fechando} style={{ marginTop: 4 }}>
              {fechando ? <><span className="spinner"></span>Fechando...</> : 'Fechar turno'}
            </button>
          ) : (
            turnoAtivo.fechamento_loja ? (
              <div className="alert alert-info" style={{ marginTop: 8 }}>
                Aguardando confirmação do motoboy para fechar.
              </div>
            ) : (
              <button className="btn btn-outline" onClick={() => fecharTurno()}
                disabled={fechando || temVermelho} style={{ marginTop: 4 }}>
                {fechando ? <><span className="spinner"></span>Verificando...</> :
                  temVermelho ? 'Divergências pendentes' : 'Solicitar fechamento'}
              </button>
            )
          )}
        </div>

        {entregas.length > 0 && (
          <div className="card">
            <h2>Entregas</h2>
            {turnoComDuploCheck && (
              <p className="muted" style={{ marginBottom: 8, fontSize: 11 }}>
                Verde = conferido · Amarelo = divergência leve · Vermelho = divergência
              </p>
            )}

            {turnoComDuploCheck ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', paddingLeft: 4 }}>BOY</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', paddingLeft: 4 }}>LOJA</div>
                </div>
                {montarPares(entregas).map((par, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6,
                    borderLeft: `3px solid ${corCheck(par.status)}`, paddingLeft: 6
                  }}>
                    <div style={{
                      background: 'var(--bg-2)', borderRadius: 6, padding: '6px 8px',
                      opacity: par.boy ? 0.75 : 0.35, minHeight: 54
                    }}>
                      {par.boy ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{par.boy.cliente}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {par.boy.km > 0 ? par.boy.km.toFixed(1) + ' km' : par.boy.bairro_destino}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>R${par.boy.taxa.toFixed(2)}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }}>— não lançado</div>
                      )}
                    </div>
                    <div
                      onClick={() => { if (par.loja) { setEntregaEditando(par.loja); setTela('editar-entrega') } }}
                      style={{
                        background: 'var(--bg-2)', borderRadius: 6, padding: '6px 8px',
                        cursor: par.loja ? 'pointer' : 'default',
                        opacity: par.loja ? 1 : 0.35, minHeight: 54
                      }}>
                      {par.loja ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{par.loja.cliente}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {par.loja.km > 0 ? par.loja.km.toFixed(1) + ' km' : par.loja.bairro_destino}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--yellow)' }}>R${par.loja.taxa.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>toque para editar</div>
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
                  onClick={() => { setEntregaEditando(e); setTela('editar-entrega') }}
                  style={{ cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{e.cliente}</div>
                    <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
                  </div>
                  <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${e.taxa.toFixed(2)}</div>
                </div>
              ))
            )}

            <div className="divider" />
            <div className="total-bar">
              <div className="total-bar-lbl">Total</div>
              <div className="total-bar-val">R${totalCusto.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Tela HOME
  return (
    <div>
      {onboarding.mostrar && (
        <OnboardingModal tipo="estabelecimento" userId={perfil.id} onFechar={onboarding.fechar} />
      )}

      <button
        onClick={onboarding.abrir}
        style={{
          position: 'fixed', bottom: 20, left: 16, zIndex: 999,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--yellow)', color: '#111', border: 'none', borderRadius: 10,
          padding: '10px 14px', fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer'
        }}
      >
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.2)', color: '#111',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700
        }}>?</span>
        Comece aqui
      </button>

      <div style={{ position: 'relative', width: '100%', height: 110, overflow: 'hidden', background: '#000' }}>
        <img src="/logo-horizontal.png" alt="MotoTaxa"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.92 }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '0 1rem 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))'
        }}>
          <div>
            <span className="badge badge-loja">Estabelecimento</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{estabAtivo?.nome || perfil.nome}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onLogout}
            style={{ marginTop: 0, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>Sair</button>
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        <div style={{ height: 12 }} />

        {turnosAntigos.length > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 12 }}>
            <strong>
              ⚠️ {turnosAntigos.length === 1 ? '1 turno aberto de dia anterior' : `${turnosAntigos.length} turnos abertos de dias anteriores`}
            </strong>
            {turnosAntigos.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 13 }}>
                  {nomeTurnoDisplay(t)} — desde {formatarData(t.inicio)} às {formatarHora(t.inicio)}
                </div>
                <button className="btn btn-sm"
                  style={{ marginTop: 0, background: 'var(--yellow)', color: '#111', fontSize: 12, padding: '6px 10px', flexShrink: 0 }}
                  onClick={() => fecharTurno(t)}
                  disabled={fechando}>
                  {fechandoId === t.id ? <span className="spinner"></span> : 'Fechar agora'}
                </button>
              </div>
            ))}
          </div>
        )}

        {vincPendentes.length > 0 && (
          <div className="alert alert-info" style={{ marginBottom: 12, cursor: 'pointer' }}
            onClick={() => setTela('vinculos')}>
            <strong>🔗 {vincPendentes.length} motoboy{vincPendentes.length > 1 ? 's' : ''} aguardando aprovação</strong>
            <div style={{ fontSize: 12, marginTop: 2 }}>Toque para ver e aprovar</div>
          </div>
        )}

        {estabelecimentos.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ marginBottom: 12 }}>Configure seu estabelecimento para começar.</p>
            <button className="btn btn-primary" onClick={() => { setEstabEditando(null); setTela('add-estab') }}>
              + Configurar estabelecimento
            </button>
          </div>
        ) : (
          <>
            {abrindoTurno ? (
              <div className="card">
                <h2>Abrir novo turno</h2>
                <label>Nome do motoboy</label>
                <input
                  placeholder="Ex: Guilherme, Gabriel..."
                  value={nomeTurno}
                  onChange={e => setNomeTurno(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && abrirTurno()}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, marginTop: 0 }}
                    onClick={abrirTurno} disabled={!nomeTurno.trim()}>
                    Abrir turno
                  </button>
                  <button className="btn btn-outline" style={{ flex: 1, marginTop: 0 }}
                    onClick={() => { setAbrindoTurno(false); setNomeTurno('') }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-primary" style={{ marginBottom: 12 }}
                onClick={() => setAbrindoTurno(true)}>
                + Abrir novo turno
              </button>
            )}

            {turnos.length === 0 ? (
              <div className="card">
                <p className="muted">Nenhum turno aberto no momento.</p>
              </div>
            ) : (
              <div className="card">
                <h2>Turnos em andamento</h2>
                {turnos.map(t => {
                  const isLoja = isTurnoLoja(t)
                  return (
                    <div key={t.id} className="row" style={{ cursor: 'pointer', borderLeft: `3px solid ${isLoja ? 'var(--yellow)' : 'var(--green)'}`, paddingLeft: 8 }}
                      onClick={async () => {
                        setTurnoAtivo(t)
                        await carregarEntregas(t.id)
                        setTela('turno')
                      }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{nomeTurnoDisplay(t)}</div>
                        <div className="muted">desde {formatarData(t.inicio)} às {formatarHora(t.inicio)}</div>
                        {isLoja && <div style={{ fontSize: 11, color: 'var(--yellow)' }}>turno da loja</div>}
                        {!isLoja && t.fechamento_loja && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>aguardando boy</div>}
                      </div>
                      <div style={{ color: 'var(--text-2)', fontSize: 20 }}>›</div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="card">
              <h2>Convidar motoboy</h2>
              <p className="muted" style={{ marginBottom: 10 }}>
                Gere um link para o motoboy entrar e já ficar vinculado à sua loja.
              </p>
              {!linkConvite ? (
                <button className="btn btn-outline" onClick={gerarLinkConvite} disabled={gerandoLink}>
                  {gerandoLink ? <><span className="spinner"></span>Gerando...</> : 'Gerar link de convite'}
                </button>
              ) : (
                <>
                  <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, wordBreak: 'break-all', marginBottom: 8, color: 'var(--text-2)' }}>
                    {linkConvite}
                  </div>
                  <button className="btn btn-primary" onClick={compartilharLink}>Compartilhar link</button>
                  <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setLinkConvite('')}>Gerar novo link</button>
                </>
              )}
            </div>

            {vincAtivos.length > 0 && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0 }}>Motoboys vinculados</h2>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{vincAtivos.length} ativo{vincAtivos.length !== 1 ? 's' : ''}</span>
                </div>
                <button className="btn btn-outline" style={{ marginTop: 8, fontSize: 13 }}
                  onClick={() => setTela('vinculos')}>Gerenciar vínculos</button>
              </div>
            )}

            {historicoTurnos.length > 0 && (
              <button className="btn btn-outline" style={{ marginTop: 4, fontSize: 12 }}
                onClick={() => setTela('historico')}>
                Ver histórico de turnos
              </button>
            )}

            <div style={{ marginTop: 4 }}>
              <button className="btn btn-outline" style={{ width: '100%', fontSize: 12 }}
                onClick={() => { setEstabEditando(estabAtivo); setTela('add-estab') }}>
                Editar estabelecimento
              </button>
              <p className="muted-sm" style={{ textAlign: 'center', marginTop: 8 }}>
                Para gerenciar outro estabelecimento, crie uma nova conta.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function GerenciarVinculosLoja({ vincAtivos, vincPendentes, onAceitar, onEncerrar, onVoltar }) {
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(null)
  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Motoboys vinculados</h1>
      </div>
      {vincPendentes.length > 0 && (
        <div className="card">
          <h2>Aguardando aprovação</h2>
          {vincPendentes.map(v => (
            <div key={v.id}>
              <div style={{ fontWeight: 500 }}>{v.profiles?.nome || 'Motoboy'}</div>
              <div className="muted" style={{ marginBottom: 8 }}>{v.profiles?.email}</div>
              <button className="btn btn-primary"
                style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}
                onClick={() => onAceitar(v.id)}>Aprovar vínculo</button>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h2>Ativos</h2>
        {vincAtivos.length === 0 ? (
          <p className="muted">Nenhum motoboy vinculado.</p>
        ) : vincAtivos.map(v => (
          <div key={v.id}>
            <div style={{ fontWeight: 500 }}>{v.profiles?.nome || 'Motoboy'}</div>
            <div className="muted" style={{ marginBottom: 8 }}>{v.profiles?.email}</div>
            {confirmandoEncerrar === v.id ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn btn-sm"
                  style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={() => { onEncerrar(v.id); setConfirmandoEncerrar(null) }}>Confirmar</button>
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

function Relatorio({ turno, estabelecimento, entregas, onVoltar, formatarHora, formatarData }) {
  const total = entregas.reduce((s, e) => s + e.taxa, 0)
  const fixa = turno?.taxa_fixa_turno || 0
  const grand = total + fixa
  const kmTotal = entregas.reduce((s, e) => s + (e.km || 0), 0)
  const nomeExibido = turno?.nome_turno || turno?.profiles?.nome || 'Motoboy'

  async function compartilhar() {
    const texto =
      `🏍️ MotoTaxa — Fechamento\n📍 ${estabelecimento?.nome}\n` +
      `👤 ${nomeExibido}\n` +
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
          <div style={{ fontWeight: 500, marginTop: 2 }}>{nomeExibido}</div>
          <div className="muted">{turno?.inicio ? `${formatarData(turno.inicio)} às ${formatarHora(turno.inicio)}` : new Date().toLocaleDateString('pt-BR')}</div>
        </div>
        <div className="grid2">
          <div className="metric"><div className="metric-val">{entregas.length}</div><div className="metric-lbl">Corridas</div></div>
          <div className="metric"><div className="metric-val">{kmTotal.toFixed(1)}</div><div className="metric-lbl">km</div></div>
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

function Historico({ turnos, onVoltar, onVerRelatorio, onApagarTurno, nomeTurnoDisplay, formatarData, formatarHora }) {
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
        const esteConfirmando = confirmandoApagar === t.id
        return (
          <div className="card" key={t.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 500 }}>{nomeTurnoDisplay(t)}</div>
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