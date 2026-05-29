'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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

function labelCheck(status) {
  if (status === 'verde') return '✓ Conferido'
  if (status === 'amarelo') return '⚠ Divergência leve'
  if (status === 'vermelho') return '✗ Divergência'
  return '— Aguardando'
}

export default function LojaHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnosAtivos, setTurnosAtivos] = useState([])
  const [turnoSelecionado, setTurnoSelecionado] = useState(null)
  const [entregas, setEntregas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [linkConvite, setLinkConvite] = useState('')
  const [gerandoLink, setGerandoLink] = useState(false)
  const [loading, setLoading] = useState(true)
  const [solicitandoFechamento, setSolicitandoFechamento] = useState(false)

  useEffect(() => { carregarDados() }, [])

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
      await detectarECriarSolicitacoes(estabs[0])
    }
    setLoading(false)
  }

  async function carregarTurnos(estabId) {
    const { data: vincs } = await supabase
      .from('vinculos').select('boy_id')
      .eq('estab_id', estabId).eq('ativo', true)
      .eq('aceito_boy', true).eq('aceito_loja', true)
    const boyIds = (vincs || []).map(v => v.boy_id)

    if (boyIds.length === 0) { setTurnosAtivos([]); setEntregas([]); return }

    const { data: turnos } = await supabase
      .from('turnos').select('*, profiles(nome)')
      .in('boy_id', boyIds).eq('status', 'aberto')
      .order('created_at', { ascending: false })
    setTurnosAtivos(turnos || [])

    if ((turnos || []).length > 0) {
      setTurnoSelecionado(turnos[0])
      await carregarEntregas(turnos[0].id)
    } else {
      setTurnoSelecionado(null)
      setEntregas([])
    }
  }

  async function carregarEntregas(turnoId) {
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

  async function solicitarFechamento() {
    if (!turnoSelecionado) return
    setSolicitandoFechamento(true)

    const { data: ents } = await supabase
      .from('entregas').select('*').eq('turno_id', turnoSelecionado.id)
    const temVermelho = (ents || []).some(e => e.status_check === 'vermelho')
    if (temVermelho) {
      alert('Ainda há divergências em vermelho. Corrija antes de fechar.')
      setSolicitandoFechamento(false)
      return
    }

    await supabase.from('turnos').update({ fechamento_loja: true }).eq('id', turnoSelecionado.id)
    const { data: turnoAtualizado } = await supabase
      .from('turnos').select('*').eq('id', turnoSelecionado.id).single()
    setTurnoSelecionado(turnoAtualizado)

    if (turnoAtualizado.fechamento_boy) {
      await supabase.from('turnos').update({
        status: 'fechado', fim: new Date().toISOString()
      }).eq('id', turnoSelecionado.id)
      await carregarTurnos(estabAtivo.id)
    }
    setSolicitandoFechamento(false)
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
  const entregasBoy = entregas.filter(e => e.origem === 'boy')
  const totalCusto = entregasBoy.reduce((s, e) => s + e.taxa, 0)
  const temVermelho = entregas.some(e => e.status_check === 'vermelho')

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

  if (tela === 'nova-entrega' && turnoSelecionado) return (
    <NovaEntrega
      userId={turnoSelecionado.boy_id}
      estabelecimento={estabAtivo}
      turnoId={turnoSelecionado.id}
      origemOverride="loja"
      onConfirmado={async () => {
        await carregarEntregas(turnoSelecionado.id)
        setTela('home')
      }}
      onVoltar={() => setTela('home')}
    />
  )

  if (tela === 'vinculos') return (
    <GerenciarVinculosLoja
      vincAtivos={vincAtivos} vincPendentes={vincPendentes}
      onAceitar={aceitarVinculo} onEncerrar={encerrarVinculo}
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
            <span className="badge badge-loja">Estabelecimento</span>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{estabAtivo?.nome || perfil.nome}</div>
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
            <div className="grid2">
              <div className="metric">
                <div className="metric-val yellow">R${totalCusto.toFixed(2)}</div>
                <div className="metric-lbl">Custo do turno</div>
              </div>
              <div className="metric">
                <div className="metric-val">{entregasBoy.length}</div>
                <div className="metric-lbl">Entregas</div>
              </div>
            </div>

            <div className="card">
              <h2>Turno em andamento</h2>
              {turnosAtivos.length === 0 ? (
                <p className="muted">Nenhum turno aberto pelos motoboys vinculados.</p>
              ) : (
                <>
                  {turnosAtivos.length > 1 && (
                    <select value={turnoSelecionado?.id || ''} onChange={async e => {
                      const t = turnosAtivos.find(x => x.id === e.target.value)
                      setTurnoSelecionado(t)
                      await carregarEntregas(t.id)
                    }} style={{ marginBottom: 8 }}>
                      {turnosAtivos.map(t => (
                        <option key={t.id} value={t.id}>{t.profiles?.nome} — desde {formatarHora(t.inicio)}</option>
                      ))}
                    </select>
                  )}
                  {turnoSelecionado && (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                        <span style={{ fontWeight: 500 }}>{turnoSelecionado.profiles?.nome}</span>
                        {' · '}desde {formatarData(turnoSelecionado.inicio)} às {formatarHora(turnoSelecionado.inicio)}
                      </div>
                      <button className="btn btn-primary" onClick={() => setTela('nova-entrega')} style={{ marginBottom: 4 }}>
                        + Registrar entrega
                      </button>
                      {turnoSelecionado.fechamento_loja ? (
                        <div className="alert alert-info" style={{ marginTop: 8 }}>
                          Aguardando confirmação do motoboy para fechar.
                        </div>
                      ) : (
                        <button className="btn btn-outline" onClick={solicitarFechamento}
                          disabled={solicitandoFechamento || temVermelho}
                          style={{ marginTop: 4 }}>
                          {solicitandoFechamento ? <><span className="spinner"></span>Verificando...</> :
                            temVermelho ? 'Divergências pendentes' : 'Solicitar fechamento'}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {entregas.length > 0 && (
              <div className="card">
                <h2>Conferência de entregas</h2>
                <p className="muted" style={{ marginBottom: 8, fontSize: 11 }}>
                  Verde = conferido · Amarelo = divergência leve · Vermelho = divergência
                </p>
                {entregas.map(e => (
                  <div className="row" key={e.id} style={{
                    borderLeft: `3px solid ${corCheck(e.status_check)}`,
                    paddingLeft: 8
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {e.cliente}
                        <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>
                          {e.origem === 'loja' ? 'loja' : 'boy'}
                        </span>
                      </div>
                      <div className="muted">
                        {e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}
                        {e.created_at && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>{formatarHora(e.created_at)}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: corCheck(e.status_check), marginTop: 2 }}>
                        {labelCheck(e.status_check)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>R${e.taxa.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                <div className="divider" />
                <div className="total-bar">
                  <div className="total-bar-lbl">Total (entregas boy)</div>
                  <div className="total-bar-val">R${totalCusto.toFixed(2)}</div>
                </div>
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

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Motoboys vinculados</h2>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{vincAtivos.length} ativo{vincAtivos.length !== 1 ? 's' : ''}</span>
              </div>
              {vincAtivos.length === 0 && vincPendentes.length === 0 ? (
                <p className="muted" style={{ marginTop: 8 }}>Nenhum motoboy vinculado ainda.</p>
              ) : (
                <button className="btn btn-outline" style={{ marginTop: 8, fontSize: 13 }}
                  onClick={() => setTela('vinculos')}>Gerenciar vínculos</button>
              )}
            </div>

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