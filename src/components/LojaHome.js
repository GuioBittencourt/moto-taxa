'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CadastroEstabelecimento from './CadastroEstabelecimento'

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

export default function LojaHome({ perfil, onLogout }) {
  const [tela, setTela] = useState('home')
  const [estabelecimentos, setEstabelecimentos] = useState([])
  const [estabAtivo, setEstabAtivo] = useState(null)
  const [estabEditando, setEstabEditando] = useState(null)
  const [turnosAtivos, setTurnosAtivos] = useState([])
  const [entregas, setEntregas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [linkConvite, setLinkConvite] = useState('')
  const [gerandoLink, setGerandoLink] = useState(false)
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
      await carregarVinculos(estabs[0].id)
    }
    setLoading(false)
  }

  async function carregarMovimento(estabId) {
    const { data: turnos } = await supabase
      .from('turnos').select('*, profiles(nome)').eq('estab_id', estabId).eq('status', 'aberto')
      .order('created_at', { ascending: false })
    setTurnosAtivos(turnos || [])

    const ids = (turnos || []).map(t => t.id)
    if (ids.length > 0) {
      const { data: ents } = await supabase
        .from('entregas').select('*').in('turno_id', ids)
        .order('created_at', { ascending: false })
      setEntregas(ents || [])
    } else setEntregas([])
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
  }

  async function encerrarVinculo(vincId) {
    await supabase.from('vinculos').update({ ativo: false }).eq('id', vincId)
    await carregarVinculos(estabAtivo.id)
  }

  async function aprovarEntrega(id) {
    await supabase.from('entregas').update({ status: 'confirmado' }).eq('id', id)
    setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: 'confirmado' } : e))
  }

  async function detectarECriarSolicitacoes(estab) {
    // Busca boys que cadastraram estab com nome+endereço parecido
    const { data: estabsBoys } = await supabase
      .from('estabelecimentos').select('id, nome, endereco_saida, criado_por')
      .neq('criado_por', perfil.id)

    // Filtra só perfis do tipo 'boy'
    const { data: perfisboy } = await supabase
      .from('profiles').select('id').eq('tipo', 'boy')
    const idsBoy = (perfisboy || []).map(p => p.id)

    for (const e of (estabsBoys || [])) {
      if (!idsBoy.includes(e.criado_por)) continue
      if (!nomesBatem(e.nome, estab.nome)) continue
      if (!enderecosBatem(e.endereco_saida, estab.endereco_saida)) continue

      const { data: vincExist } = await supabase
        .from('vinculos').select('id')
        .eq('boy_id', e.criado_por).eq('estab_id', estab.id)
        .maybeSingle()

      if (!vincExist) {
        // Cria solicitação — boy já aceitou implicitamente (cadastrou o estab), loja precisa aceitar
        await supabase.from('vinculos').insert({
          boy_id: e.criado_por, estab_id: estab.id,
          ativo: true, aceito_boy: true, aceito_loja: false
        })
      }
    }
    await carregarVinculos(estab.id)
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
  const vincPendentes = vinculos.filter(v => v.ativo && v.aceito_boy && !v.aceito_loja)
  const vincAtivos = vinculos.filter(v => v.ativo && v.aceito_boy && v.aceito_loja)

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
        await carregarMovimento(e.id)
        setTela('home')
      }}
      onVoltar={() => { setEstabEditando(null); setTela('home') }}
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
            {estabelecimentos.length > 1 && (
              <div className="card">
                <label>Estabelecimento</label>
                <select value={estabAtivo?.id || ''} onChange={async e => {
                  const es = estabelecimentos.find(x => x.id === e.target.value)
                  setEstabAtivo(es)
                  await carregarMovimento(es.id)
                  await carregarVinculos(es.id)
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
                    <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
                      {entsT.length} entregas · R${totT.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>

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
                      <button className="btn btn-sm"
                        style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)', marginTop: 0 }}
                        onClick={() => aprovarEntrega(e.id)}>Aprovar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

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

      {tela === 'vinculos' && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100, overflowY: 'auto' }}>
          <GerenciarVinculosLoja
            vincAtivos={vincAtivos} vincPendentes={vincPendentes}
            onAceitar={aceitarVinculo} onEncerrar={encerrarVinculo}
            onVoltar={() => setTela('home')}
          />
        </div>
      )}
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