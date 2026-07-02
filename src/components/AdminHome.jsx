'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function formatarData(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatarHora(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function MetricCard({ label, value, sub, cor }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 14px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--yellow)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function AdminHome({ perfil, onLogout }) {
  const [aba, setAba] = useState('dashboard')
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null)
  const [boySelecionado, setBoySelecionado] = useState(null)

  useEffect(() => { carregarTudo() }, [])

  async function carregarTudo() {
    setLoading(true)

    // Empresas (estabelecimentos)
    const { data: estabs } = await supabase
      .from('estabelecimentos').select('*')
      .order('created_at', { ascending: false })

    // Profiles de todos os usuários
    const { data: profiles } = await supabase
      .from('profiles').select('*')

    // Vínculos
    const { data: vinculos } = await supabase
      .from('vinculos').select('*').eq('ativo', true).eq('aceito_boy', true).eq('aceito_loja', true)

    // Turnos
    const { data: turnos } = await supabase
      .from('turnos').select('*').order('created_at', { ascending: false })

    // Entregas
    const { data: entregas } = await supabase
      .from('entregas').select('*').order('created_at', { ascending: false })

    // Processa dados
    const boys = (profiles || []).filter(p => p.tipo === 'boy')
    const lojas = (profiles || []).filter(p => p.tipo === 'estabelecimento')

    // Métricas por empresa
    const empresasComDados = (estabs || []).map(e => {
      const turnosEstab = (turnos || []).filter(t => t.estab_id === e.id)
      const entregasEstab = (entregas || []).filter(ent => ent.estab_id === e.id)
      const boysVinculados = (vinculos || []).filter(v => v.estab_id === e.id).map(v => v.boy_id)
      const kmTotal = entregasEstab.reduce((s, ent) => s + (ent.km || 0), 0)
      const taxaTotal = entregasEstab.reduce((s, ent) => s + (ent.taxa || 0), 0)
      const turnosFechados = turnosEstab.filter(t => t.status === 'fechado')
      const profile = (profiles || []).find(p => p.id === e.criado_por)

      return {
        ...e,
        nomeProfile: profile?.nome || e.nome,
        emailProfile: profile?.email || '',
        totalTurnos: turnosEstab.length,
        turnosFechados: turnosFechados.length,
        totalEntregas: entregasEstab.length,
        kmTotal: +kmTotal.toFixed(1),
        taxaTotal: +taxaTotal.toFixed(2),
        boysVinculados: boysVinculados.length,
        ativo: turnosEstab.some(t => t.status === 'aberto')
      }
    })

    // Métricas por boy
    const boysComDados = boys.map(b => {
      const turnosBoy = (turnos || []).filter(t => t.boy_id === b.id)
      const entregasBoy = (entregas || []).filter(e => e.boy_id === b.id && e.origem === 'boy')
      const vincsAtivos = (vinculos || []).filter(v => v.boy_id === b.id)
      const kmTotal = entregasBoy.reduce((s, e) => s + (e.km || 0), 0)
      const taxaTotal = entregasBoy.reduce((s, e) => s + (e.taxa || 0), 0)
      const estabsVinculados = vincsAtivos.map(v => {
        const estab = (estabs || []).find(e => e.id === v.estab_id)
        return estab?.nome || ''
      }).filter(Boolean)

      return {
        ...b,
        totalTurnos: turnosBoy.length,
        totalEntregas: entregasBoy.length,
        kmTotal: +kmTotal.toFixed(1),
        taxaTotal: +taxaTotal.toFixed(2),
        estabsVinculados,
        ativo: turnosBoy.some(t => t.status === 'aberto')
      }
    })

    // Métricas gerais
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicioSemana = new Date(hoje)
    inicioSemana.setDate(hoje.getDate() - hoje.getDay())

    const entregasHoje = (entregas || []).filter(e => {
      const d = new Date(e.created_at)
      return d.toDateString() === hoje.toDateString()
    })
    const entregasMes = (entregas || []).filter(e => new Date(e.created_at) >= inicioMes)
    const entregasSemana = (entregas || []).filter(e => new Date(e.created_at) >= inicioSemana)

    const regioes = {}
    ;(entregas || []).forEach(e => {
      const r = e.bairro_destino || 'Sem bairro'
      regioes[r] = (regioes[r] || 0) + 1
    })
    const topRegioes = Object.entries(regioes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    setDados({
      empresas: empresasComDados,
      boys: boysComDados,
      totalEmpresas: empresasComDados.length,
      empresasAtivas: empresasComDados.filter(e => e.ativo).length,
      totalBoys: boys.length,
      boysAtivos: boysComDados.filter(b => b.ativo).length,
      totalEntregas: (entregas || []).length,
      entregasHoje: entregasHoje.length,
      entregasSemana: entregasSemana.length,
      entregasMes: entregasMes.length,
      kmTotalGeral: +((entregas || []).reduce((s, e) => s + (e.km || 0), 0)).toFixed(1),
      taxaTotalGeral: +((entregas || []).reduce((s, e) => s + (e.taxa || 0), 0)).toFixed(2),
      topRegioes,
      turnos: turnos || [],
      entregas: entregas || []
    })

    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <span className="spinner" style={{ width: 28, height: 28 }}></span>
    </div>
  )

  if (empresaSelecionada) return (
    <DetalheEmpresa
      empresa={empresaSelecionada}
      turnos={dados.turnos.filter(t => t.estab_id === empresaSelecionada.id)}
      entregas={dados.entregas.filter(e => e.estab_id === empresaSelecionada.id)}
      boys={dados.boys}
      onVoltar={() => setEmpresaSelecionada(null)}
      formatarData={formatarData} formatarHora={formatarHora}
    />
  )

  if (boySelecionado) return (
    <DetalheBoy
      boy={boySelecionado}
      turnos={dados.turnos.filter(t => t.boy_id === boySelecionado.id)}
      entregas={dados.entregas.filter(e => e.boy_id === boySelecionado.id && e.origem === 'boy')}
      onVoltar={() => setBoySelecionado(null)}
      formatarData={formatarData} formatarHora={formatarHora}
    />
  )

  return (
    <div>
      {/* Header */}
      <div style={{ background: '#111', padding: '12px 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>MotoTaxa</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--yellow)' }}>Painel ADM</div>
        </div>
        <button className="btn btn-sm btn-outline" onClick={onLogout}
          style={{ color: 'var(--text-2)', borderColor: 'var(--border)', marginTop: 0 }}>Sair</button>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
        {[['dashboard', 'Dashboard'], ['empresas', 'Empresas'], ['boys', 'Motoboys']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)} style={{
            flex: 1, padding: '10px 0', fontSize: 13, fontWeight: aba === id ? 700 : 400,
            color: aba === id ? 'var(--yellow)' : 'var(--text-2)',
            background: 'none', border: 'none', borderBottom: aba === id ? '2px solid var(--yellow)' : '2px solid transparent',
            cursor: 'pointer'
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '0 1rem', paddingBottom: 32 }}>
        <div style={{ height: 12 }} />

        {aba === 'dashboard' && <Dashboard dados={dados} formatarData={formatarData} />}
        {aba === 'empresas' && (
          <ListaEmpresas empresas={dados.empresas} onSelecionar={setEmpresaSelecionada} />
        )}
        {aba === 'boys' && (
          <ListaBoys boys={dados.boys} onSelecionar={setBoySelecionado} />
        )}
      </div>
    </div>
  )
}

function Dashboard({ dados, formatarData }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Visão geral</h2>

      {/* Empresas */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Empresas</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total cadastradas" value={dados.totalEmpresas} />
          <MetricCard label="Com turno ativo agora" value={dados.empresasAtivas} cor="#22c55e" />
        </div>
      </div>

      {/* Motoboys */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Motoboys</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total cadastrados" value={dados.totalBoys} />
          <MetricCard label="Com turno ativo agora" value={dados.boysAtivos} cor="#22c55e" />
        </div>
      </div>

      {/* Entregas */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Entregas</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MetricCard label="Hoje" value={dados.entregasHoje} />
          <MetricCard label="Esta semana" value={dados.entregasSemana} />
          <MetricCard label="Este mês" value={dados.entregasMes} />
          <MetricCard label="Total" value={dados.totalEntregas} cor="var(--text-1)" />
        </div>
      </div>

      {/* Financeiro */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Financeiro acumulado</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total taxas pagas" value={`R$${dados.taxaTotalGeral.toFixed(2)}`} />
          <MetricCard label="Total km rodados" value={`${dados.kmTotalGeral} km`} cor="var(--text-1)" />
        </div>
      </div>

      {/* Top regiões */}
      <div className="card">
        <h2>Top 5 bairros mais entregues</h2>
        {dados.topRegioes.map(([bairro, qtd], i) => (
          <div key={bairro} className="row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 700, fontSize: 13 }}>#{i + 1}</span>
              <span style={{ fontWeight: 500 }}>{bairro}</span>
            </div>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{qtd} entregas</span>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid var(--yellow)' }}>
        <h2>💡 Insights estratégicos</h2>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {dados.totalEmpresas === 0 && <p>Nenhuma empresa cadastrada ainda. Foque em onboarding.</p>}
          {dados.totalEmpresas > 0 && dados.empresasAtivas === 0 && (
            <p>⚠️ Nenhuma empresa com turno ativo agora. Pode ser horário fora de operação ou problema de engajamento.</p>
          )}
          {dados.entregasHoje > 0 && (
            <p>✅ {dados.entregasHoje} entregas hoje. Ritmo diário ativo.</p>
          )}
          {dados.topRegioes.length > 0 && (
            <p>📍 O bairro <strong>{dados.topRegioes[0][0]}</strong> concentra mais entregas — potencial para anunciante local (farmácia, conveniência) nessa região.</p>
          )}
          {dados.totalBoys > 0 && dados.totalEmpresas > 0 && (
            <p>📊 Média de {(dados.totalBoys / dados.totalEmpresas).toFixed(1)} motoboys por empresa. Se subir para 3+, o modelo de assinatura por boy fica mais interessante financeiramente.</p>
          )}
          {dados.taxaTotalGeral > 0 && (
            <p>💰 R${dados.taxaTotalGeral.toFixed(2)} em taxas processadas na plataforma. Esse volume justifica a conversa com parceiros fintech quando chegar a R$10k/mês.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ListaEmpresas({ empresas, onSelecionar }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Empresas ({empresas.length})</h2>
      {empresas.length === 0 && <p className="muted">Nenhuma empresa cadastrada.</p>}
      {empresas.map(e => (
        <div key={e.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => onSelecionar(e)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.nome}</div>
              <div className="muted">{e.cidade} · {e.endereco_saida}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{e.emailProfile}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: e.ativo ? '#22c55e22' : 'var(--bg-2)',
                color: e.ativo ? '#22c55e' : 'var(--text-3)'
              }}>
                {e.ativo ? '● ativo' : '○ inativo'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Entregas: </span><strong>{e.totalEntregas}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>KM: </span><strong>{e.kmTotal}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Taxas: </span><strong style={{ color: 'var(--yellow)' }}>R${e.taxaTotal.toFixed(2)}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Boys: </span><strong>{e.boysVinculados}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Turnos: </span><strong>{e.totalTurnos}</strong></div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
            Cadastro: {formatarData(e.created_at)} · toque para ver detalhes
          </div>
        </div>
      ))}
    </div>
  )
}

function ListaBoys({ boys, onSelecionar }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Motoboys ({boys.length})</h2>
      {boys.length === 0 && <p className="muted">Nenhum motoboy cadastrado.</p>}
      {boys.map(b => (
        <div key={b.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => onSelecionar(b)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{b.nome}</div>
              <div className="muted">{b.email}</div>
              {b.estabsVinculados.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  Vínculos: {b.estabsVinculados.join(', ')}
                </div>
              )}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: b.ativo ? '#22c55e22' : 'var(--bg-2)',
              color: b.ativo ? '#22c55e' : 'var(--text-3)'
            }}>
              {b.ativo ? '● ativo' : '○ inativo'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Entregas: </span><strong>{b.totalEntregas}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>KM: </span><strong>{b.kmTotal}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Recebeu: </span><strong style={{ color: 'var(--yellow)' }}>R${b.taxaTotal.toFixed(2)}</strong></div>
            <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Turnos: </span><strong>{b.totalTurnos}</strong></div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
            toque para ver detalhes
          </div>
        </div>
      ))}
    </div>
  )
}

function DetalheEmpresa({ empresa, turnos, entregas, boys, onVoltar, formatarData, formatarHora }) {
  const entregasPorDia = {}
  entregas.forEach(e => {
    const dia = new Date(e.created_at).toLocaleDateString('pt-BR')
    entregasPorDia[dia] = (entregasPorDia[dia] || 0) + 1
  })
  const diasAtivos = Object.keys(entregasPorDia).length
  const mediaEntregasDia = diasAtivos > 0 ? (entregas.length / diasAtivos).toFixed(1) : 0

  const boysQueUsaram = [...new Set(turnos.map(t => t.boy_id))]
  const boysDetalhes = boysQueUsaram.map(id => {
    const boy = boys.find(b => b.id === id)
    const entsBoy = entregas.filter(e => e.boy_id === id && e.origem === 'boy')
    return { nome: boy?.nome || id, totalEntregas: entsBoy.length, taxaTotal: entsBoy.reduce((s, e) => s + e.taxa, 0) }
  }).sort((a, b) => b.totalEntregas - a.totalEntregas)

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>{empresa.nome}</h1>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          {empresa.cidade} · {empresa.endereco_saida}<br />
          <span style={{ color: 'var(--text-3)' }}>{empresa.emailProfile}</span><br />
          <span style={{ color: 'var(--text-3)' }}>Cadastro: {formatarData(empresa.created_at)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MetricCard label="Total entregas" value={empresa.totalEntregas} />
          <MetricCard label="Total km" value={`${empresa.kmTotal} km`} cor="var(--text-1)" />
          <MetricCard label="Taxas pagas" value={`R$${empresa.taxaTotal.toFixed(2)}`} />
          <MetricCard label="Turnos abertos" value={empresa.totalTurnos} cor="var(--text-1)" />
          <MetricCard label="Média/dia" value={mediaEntregasDia} cor="var(--text-1)" sub="entregas por dia ativo" />
          <MetricCard label="Boys vinculados" value={empresa.boysVinculados} cor="var(--text-1)" />
        </div>
      </div>

      {boysDetalhes.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>Motoboys que atuaram aqui</h2>
          {boysDetalhes.map((b, i) => (
            <div key={i} className="row">
              <div style={{ fontWeight: 500 }}>{b.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>
                {b.totalEntregas} entregas · <span style={{ color: 'var(--yellow)' }}>R${b.taxaTotal.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {turnos.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>Últimos turnos</h2>
          {turnos.slice(0, 10).map(t => (
            <div key={t.id} className="row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatarData(t.inicio)} às {formatarHora(t.inicio)}</div>
                <div className="muted">{t.status === 'fechado' ? `fechado ${t.fim ? formatarHora(t.fim) : ''}` : '● aberto'}</div>
              </div>
              <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${(t.taxa_fixa_turno || 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid var(--yellow)' }}>
        <h2>💡 Análise desta empresa</h2>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {empresa.totalEntregas === 0 && <p>⚠️ Sem entregas registradas. Empresa pode estar no período de onboarding ou inativa.</p>}
          {parseFloat(mediaEntregasDia) > 0 && parseFloat(mediaEntregasDia) < 5 && (
            <p>📊 Média de {mediaEntregasDia} entregas/dia — volume baixo. Pode indicar uso esporádico ou empresa pequena. Oportunidade: mostrar relatório de economia comparado com controle manual.</p>
          )}
          {parseFloat(mediaEntregasDia) >= 5 && (
            <p>✅ {mediaEntregasDia} entregas/dia — empresa ativa. Boa candidata para o plano de assinatura R$29/boy/dia.</p>
          )}
          {empresa.boysVinculados >= 3 && (
            <p>💰 {empresa.boysVinculados} boys vinculados. Receita potencial: R${(empresa.boysVinculados * 29 * 22).toLocaleString('pt-BR')}/mês no modelo de assinatura.</p>
          )}
          {empresa.kmTotal > 0 && (
            <p>🛵 {empresa.kmTotal} km rodados no total pela empresa — dado valioso para seguradora parceira (seguro por km).</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DetalheBoy({ boy, turnos, entregas, onVoltar, formatarData, formatarHora }) {
  const kmTotal = entregas.reduce((s, e) => s + (e.km || 0), 0)
  const taxaTotal = entregas.reduce((s, e) => s + (e.taxa || 0), 0)
  const diasAtivos = [...new Set(turnos.map(t => new Date(t.created_at).toLocaleDateString('pt-BR')))].length
  const mediaKmDia = diasAtivos > 0 ? (kmTotal / diasAtivos).toFixed(1) : 0
  const mediaTaxaDia = diasAtivos > 0 ? (taxaTotal / diasAtivos).toFixed(2) : 0

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>{boy.nome}</h1>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          {boy.email}<br />
          {boy.estabsVinculados?.length > 0 && (
            <span style={{ color: 'var(--text-3)' }}>Vínculos: {boy.estabsVinculados.join(', ')}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MetricCard label="Total entregas" value={boy.totalEntregas} />
          <MetricCard label="Total km" value={`${boy.kmTotal} km`} cor="var(--text-1)" />
          <MetricCard label="Total recebido" value={`R$${boy.taxaTotal.toFixed(2)}`} />
          <MetricCard label="Total turnos" value={boy.totalTurnos} cor="var(--text-1)" />
          <MetricCard label="Dias ativos" value={diasAtivos} cor="var(--text-1)" />
          <MetricCard label="Média km/dia" value={`${mediaKmDia} km`} cor="var(--text-1)" />
          <MetricCard label="Média ganho/dia" value={`R$${mediaTaxaDia}`} sub="dias com atividade" />
        </div>
      </div>

      {turnos.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>Últimos turnos</h2>
          {turnos.slice(0, 10).map(t => (
            <div key={t.id} className="row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatarData(t.inicio)} às {formatarHora(t.inicio)}</div>
                <div className="muted">{t.status === 'fechado' ? `fechado ${t.fim ? formatarHora(t.fim) : ''}` : '● aberto'}</div>
              </div>
              <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${(t.taxa_fixa_turno || 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid var(--yellow)' }}>
        <h2>💡 Análise deste motoboy</h2>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {boy.totalEntregas === 0 && <p>⚠️ Sem entregas registradas. Boy pode estar no onboarding ou inativo.</p>}
          {parseFloat(mediaTaxaDia) > 0 && parseFloat(mediaTaxaDia) < 50 && (
            <p>📊 Ganho médio de R${mediaTaxaDia}/dia — perfil de uso baixo. Pode ser boy secundário ou em período de teste.</p>
          )}
          {parseFloat(mediaTaxaDia) >= 50 && (
            <p>✅ R${mediaTaxaDia}/dia de ganho médio — boy ativo e engajado. Perfil ideal para parceiro fintech (resgate na noite, rendimento CDI).</p>
          )}
          {parseFloat(mediaKmDia) > 30 && (
            <p>🛵 {mediaKmDia} km/dia em média — alto volume. Oportunidade para seguro por km ou revisão com parceiro mecânico.</p>
          )}
          {boy.estabsVinculados?.length > 1 && (
            <p>🔗 Atua em {boy.estabsVinculados.length} empresas diferentes — boy multiempresa, indica dependência da plataforma e menor risco de churn.</p>
          )}
        </div>
      </div>
    </div>
  )
}