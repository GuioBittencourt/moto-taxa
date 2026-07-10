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

function linkWhatsApp(numero, mensagem) {
  const digitos = (numero || '').replace(/\D/g, '')
  if (!digitos) return null
  const comCodigoPais = digitos.startsWith('55') ? digitos : `55${digitos}`
  const textoCodificado = mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''
  return `https://wa.me/${comCodigoPais}${textoCodificado}`
}

function IconeContato() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 3 }}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  )
}

function WhatsAppLink({ numero, mensagem }) {
  const textoPadrao = 'Olá! Aqui é da equipe MotoTaxa 🏍️ Tudo bem?'
  const link = linkWhatsApp(numero, mensagem || textoPadrao)
  if (!link) return null
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{ color: 'var(--yellow)', textDecoration: 'none' }}>
      <IconeContato />{numero}
    </a>
  )
}

function MetricCard({ label, value, sub, cor }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--yellow)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// --- Helpers de marcos de relacionamento ---

function verificarAniversario(dataCadastro, hoje) {
  const cadastro = new Date(dataCadastro)
  const diffDias = Math.floor((hoje - cadastro) / (1000 * 60 * 60 * 24))

  if (diffDias === 7) return '1 semana de MotoTaxa'

  const marcosMeses = [
    { meses: 3, label: '3 meses de MotoTaxa' },
    { meses: 6, label: '6 meses de MotoTaxa' },
    { meses: 12, label: '1 ano de MotoTaxa' },
  ]
  for (const m of marcosMeses) {
    const alvo = new Date(cadastro)
    alvo.setMonth(alvo.getMonth() + m.meses)
    if (alvo.toDateString() === hoje.toDateString()) return m.label
  }

  for (let anos = 2; anos <= 10; anos++) {
    const alvo = new Date(cadastro)
    alvo.setFullYear(alvo.getFullYear() + anos)
    if (alvo.toDateString() === hoje.toDateString()) return `${anos} anos de MotoTaxa`
  }

  return null
}

function verificarRecordeDiario(listaEntregas, hoje) {
  const porDia = {}
  listaEntregas.forEach(e => {
    const dia = new Date(e.created_at).toDateString()
    porDia[dia] = (porDia[dia] || 0) + 1
  })
  const hojeStr = hoje.toDateString()
  const contagemHoje = porDia[hojeStr] || 0
  if (contagemHoje === 0) return null

  const diasAnteriores = Object.entries(porDia).filter(([dia]) => dia !== hojeStr)
  if (diasAnteriores.length === 0) return null

  const recordeAnterior = Math.max(...diasAnteriores.map(([, qtd]) => qtd))
  if (contagemHoje > recordeAnterior) return contagemHoje
  return null
}

function verificarMarcoVolume(listaEntregas, hoje) {
  const marcos = [50, 100, 250, 500, 1000, 2000, 5000]
  const hojeStr = hoje.toDateString()
  const totalAntes = listaEntregas.filter(e => new Date(e.created_at).toDateString() !== hojeStr).length
  const totalDepois = listaEntregas.length
  for (const marco of marcos) {
    if (totalAntes < marco && totalDepois >= marco) return marco
  }
  return null
}

export default function AdminHome({ perfil, onLogout, onVoltar }) {
  const [aba, setAba] = useState('dashboard')
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null)
  const [boySelecionado, setBoySelecionado] = useState(null)

  useEffect(() => { carregarTudo() }, [])

  async function carregarTudo() {
    setLoading(true)
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicioSemana = new Date(hoje)
    inicioSemana.setDate(hoje.getDate() - hoje.getDay())

    const { data: estabs } = await supabase
      .from('estabelecimentos').select('*')
      .order('created_at', { ascending: false })

    const { data: profiles } = await supabase
      .from('profiles').select('*')

    const { data: vinculos } = await supabase
      .from('vinculos').select('*').eq('ativo', true).eq('aceito_boy', true).eq('aceito_loja', true)

    const { data: turnos } = await supabase
      .from('turnos').select('*').order('created_at', { ascending: false })

    const { data: entregas } = await supabase
      .from('entregas').select('*').order('created_at', { ascending: false })

    const boys = (profiles || []).filter(p => p.tipo === 'boy')

    const empresasComDados = (estabs || []).map(e => {
      const turnosEstab = (turnos || []).filter(t => t.estab_id === e.id)
      const entregasEstab = (entregas || []).filter(ent => ent.estab_id === e.id)
      const boysVinculados = (vinculos || []).filter(v => v.estab_id === e.id).map(v => v.boy_id)
      const kmTotal = entregasEstab.reduce((s, ent) => s + (ent.km || 0), 0)
      const taxaTotal = entregasEstab.reduce((s, ent) => s + (ent.taxa || 0), 0)
      const profile = (profiles || []).find(p => p.id === e.criado_por)

      const turnosOrdenados = [...turnosEstab].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      const ultimaAtividade = turnosOrdenados[0]?.created_at || e.created_at
      const diasSemAtividade = Math.floor((hoje - new Date(ultimaAtividade)) / (1000 * 60 * 60 * 24))

      const aniversario = verificarAniversario(e.created_at, hoje)
      const recordeHoje = verificarRecordeDiario(entregasEstab, hoje)
      const marcoVolume = verificarMarcoVolume(entregasEstab, hoje)
      const eventosHoje = []
      if (aniversario) eventosHoje.push({
        texto: `🎂 ${aniversario}`,
        mensagem: `Parabéns! Hoje a ${e.nome} completa ${aniversario.toLowerCase()}! 🎉 Muito obrigado por fazer parte da nossa jornada com o MotoTaxa.`
      })
      if (recordeHoje) eventosHoje.push({
        texto: `🚀 Recorde: ${recordeHoje} entregas em um dia`,
        mensagem: `Parabéns! Hoje a ${e.nome} bateu um recorde pessoal: ${recordeHoje} entregas em um único dia! 🚀 Continue assim!`
      })
      if (marcoVolume) eventosHoje.push({
        texto: `🏆 ${marcoVolume}ª entrega alcançada`,
        mensagem: `Parabéns! A ${e.nome} acabou de bater a marca de ${marcoVolume} entregas pelo MotoTaxa! 🎉 Obrigado pela confiança.`
      })

      return {
        ...e,
        nomeProfile: profile?.nome || e.nome,
        emailProfile: profile?.email || '',
        whatsappProfile: profile?.whatsapp || '',
        totalTurnos: turnosEstab.length,
        turnosFechados: turnosEstab.filter(t => t.status === 'fechado').length,
        totalEntregas: entregasEstab.length,
        kmTotal: +kmTotal.toFixed(1),
        taxaTotal: +taxaTotal.toFixed(2),
        boysVinculados: boysVinculados.length,
        ativo: turnosEstab.some(t => t.status === 'aberto'),
        diasSemAtividade,
        eventosHoje
      }
    })

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

      const aniversario = verificarAniversario(b.created_at, hoje)
      const recordeHoje = verificarRecordeDiario(entregasBoy, hoje)
      const marcoVolume = verificarMarcoVolume(entregasBoy, hoje)
      const eventosHoje = []
      if (aniversario) eventosHoje.push({
        texto: `🎂 ${aniversario}`,
        mensagem: `Parabéns, ${b.nome}! Hoje você completa ${aniversario.toLowerCase()}! 🎉 Muito obrigado por fazer parte da nossa jornada com o MotoTaxa.`
      })
      if (recordeHoje) eventosHoje.push({
        texto: `🚀 Recorde: ${recordeHoje} entregas em um dia`,
        mensagem: `Parabéns, ${b.nome}! Hoje você bateu seu recorde pessoal: ${recordeHoje} entregas em um único dia! 🚀 Continue assim!`
      })
      if (marcoVolume) eventosHoje.push({
        texto: `🏆 ${marcoVolume}ª entrega alcançada`,
        mensagem: `Parabéns, ${b.nome}! Você acabou de bater a marca de ${marcoVolume} entregas pelo MotoTaxa! 🎉 Obrigado pela parceria.`
      })

      return {
        ...b,
        totalTurnos: turnosBoy.length,
        totalEntregas: entregasBoy.length,
        kmTotal: +kmTotal.toFixed(1),
        taxaTotal: +taxaTotal.toFixed(2),
        estabsVinculados,
        ativo: turnosBoy.some(t => t.status === 'aberto'),
        eventosHoje
      }
    })

    const entregasHoje = (entregas || []).filter(e => new Date(e.created_at).toDateString() === hoje.toDateString())
    const entregasMes = (entregas || []).filter(e => new Date(e.created_at) >= inicioMes)
    const entregasSemana = (entregas || []).filter(e => new Date(e.created_at) >= inicioSemana)

    const regioes = {}
    ;(entregas || []).forEach(e => {
      const r = e.bairro_destino || 'Sem bairro'
      regioes[r] = (regioes[r] || 0) + 1
    })
    const topRegioes = Object.entries(regioes).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const empresasInativas = empresasComDados
      .filter(e => !e.ativo && e.diasSemAtividade >= 3)
      .sort((a, b) => b.diasSemAtividade - a.diasSemAtividade)

    const empresasComEventos = empresasComDados.filter(e => e.eventosHoje.length > 0)
    const boysComEventos = boysComDados.filter(b => b.eventosHoje.length > 0)

    const destaqueEmpresaMes = empresasComDados
      .map(e => ({
        nome: e.nome,
        whatsapp: e.whatsappProfile,
        receitaMes: entregasMes.filter(ent => ent.estab_id === e.id).reduce((s, ent) => s + (ent.taxa || 0), 0)
      }))
      .filter(e => e.receitaMes > 0)
      .sort((a, b) => b.receitaMes - a.receitaMes)[0] || null

    const destaqueBoyMes = boysComDados
      .map(b => ({
        nome: b.nome,
        whatsapp: b.whatsapp,
        entregasMes: entregasMes.filter(ent => ent.boy_id === b.id && ent.origem === 'boy').length
      }))
      .filter(b => b.entregasMes > 0)
      .sort((a, b) => b.entregasMes - a.entregasMes)[0] || null

    setDados({
      empresas: empresasComDados,
      boys: boysComDados,
      empresasInativas,
      empresasComEventos,
      boysComEventos,
      destaqueEmpresaMes,
      destaqueBoyMes,
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
      <div style={{ background: '#111', padding: '12px 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>MotoTaxa</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--yellow)' }}>Painel ADM</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onVoltar && (
            <button className="btn btn-sm btn-outline" onClick={onVoltar}
              style={{ color: 'var(--yellow)', borderColor: 'var(--yellow)', marginTop: 0 }}>← App</button>
          )}
          <button className="btn btn-sm btn-outline" onClick={onLogout}
            style={{ color: 'var(--text-2)', borderColor: 'var(--border)', marginTop: 0 }}>Sair</button>
        </div>
      </div>

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
        {aba === 'empresas' && <ListaEmpresas empresas={dados.empresas} onSelecionar={setEmpresaSelecionada} />}
        {aba === 'boys' && <ListaBoys boys={dados.boys} onSelecionar={setBoySelecionado} />}
      </div>
    </div>
  )
}

function Dashboard({ dados }) {
  const temEventosHoje = dados.empresasComEventos.length > 0 || dados.boysComEventos.length > 0
  const temDestaques = dados.destaqueEmpresaMes || dados.destaqueBoyMes

  return (
    <div>
      {dados.empresasInativas.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
          <h2>⚠️ {dados.empresasInativas.length} empresa{dados.empresasInativas.length > 1 ? 's' : ''} sem atividade (3+ dias)</h2>
          {dados.empresasInativas.map(e => (
            <div key={e.id} className="row">
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{e.nome}</div>
                <div className="muted-sm">{e.diasSemAtividade} dias sem turno</div>
              </div>
              {e.whatsappProfile && (
                <WhatsAppLink
                  numero={e.whatsappProfile}
                  mensagem={`Olá! Aqui é da equipe MotoTaxa 🏍️ Notei que a ${e.nome} não abriu nenhum turno recentemente. Precisa de alguma ajuda ou está tudo bem por aí?`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {(temEventosHoje || temDestaques) && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--yellow)' }}>
          <h2>🎉 Relacionamento e Conquistas</h2>

          {temEventosHoje && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 8, marginBottom: 6 }}>
                Hoje é dia de comemorar
              </div>
              {dados.empresasComEventos.map(e => (
                e.eventosHoje.map((evento, i) => (
                  <div key={`emp-${e.id}-${i}`} className="row">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{e.nome}</div>
                      <div className="muted-sm">{evento.texto}</div>
                    </div>
                    {e.whatsappProfile && <WhatsAppLink numero={e.whatsappProfile} mensagem={evento.mensagem} />}
                  </div>
                ))
              ))}
              {dados.boysComEventos.map(b => (
                b.eventosHoje.map((evento, i) => (
                  <div key={`boy-${b.id}-${i}`} className="row">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{b.nome} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(motoboy)</span></div>
                      <div className="muted-sm">{evento.texto}</div>
                    </div>
                    {b.whatsapp && <WhatsAppLink numero={b.whatsapp} mensagem={evento.mensagem} />}
                  </div>
                ))
              ))}
            </>
          )}

          {temDestaques && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>
                Destaques do mês
              </div>
              {dados.destaqueEmpresaMes && (
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>🏆 {dados.destaqueEmpresaMes.nome}</div>
                    <div className="muted-sm">Empresa com mais movimento este mês — R${dados.destaqueEmpresaMes.receitaMes.toFixed(2)}</div>
                  </div>
                  {dados.destaqueEmpresaMes.whatsapp && (
                    <WhatsAppLink numero={dados.destaqueEmpresaMes.whatsapp}
                      mensagem={`Parabéns! A ${dados.destaqueEmpresaMes.nome} foi a empresa com mais movimento no MotoTaxa este mês! 🏆 Obrigado por confiar na gente.`} />
                  )}
                </div>
              )}
              {dados.destaqueBoyMes && (
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>🏆 {dados.destaqueBoyMes.nome}</div>
                    <div className="muted-sm">Motoboy com mais entregas este mês — {dados.destaqueBoyMes.entregasMes} entregas</div>
                  </div>
                  {dados.destaqueBoyMes.whatsapp && (
                    <WhatsAppLink numero={dados.destaqueBoyMes.whatsapp}
                      mensagem={`Parabéns, ${dados.destaqueBoyMes.nome}! Você foi o motoboy com mais entregas no MotoTaxa este mês! 🏆 Continue com esse ritmo!`} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <h2 style={{ marginBottom: 12 }}>Visão geral</h2>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Empresas</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total cadastradas" value={dados.totalEmpresas} />
          <MetricCard label="Com turno ativo agora" value={dados.empresasAtivas} cor="#22c55e" />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Motoboys</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total cadastrados" value={dados.totalBoys} />
          <MetricCard label="Com turno ativo agora" value={dados.boysAtivos} cor="#22c55e" />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Entregas</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MetricCard label="Hoje" value={dados.entregasHoje} />
          <MetricCard label="Esta semana" value={dados.entregasSemana} />
          <MetricCard label="Este mês" value={dados.entregasMes} />
          <MetricCard label="Total" value={dados.totalEntregas} cor="var(--text-1)" />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Financeiro acumulado (fluxo entre empresas e boys)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MetricCard label="Total taxas pagas" value={`R$${dados.taxaTotalGeral.toFixed(2)}`} />
          <MetricCard label="Total km rodados" value={`${dados.kmTotalGeral} km`} cor="var(--text-1)" />
        </div>
      </div>

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

      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid var(--yellow)' }}>
        <h2>💡 Insights estratégicos</h2>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {dados.totalEmpresas === 0 && <p>Nenhuma empresa cadastrada ainda. Foque em onboarding.</p>}
          {dados.totalEmpresas > 0 && dados.empresasAtivas === 0 && (
            <p>⚠️ Nenhuma empresa com turno ativo agora. Pode ser horário fora de operação.</p>
          )}
          {dados.entregasHoje > 0 && <p>✅ {dados.entregasHoje} entregas hoje. Ritmo diário ativo.</p>}
          {dados.topRegioes.length > 0 && (
            <p>📍 O bairro <strong>{dados.topRegioes[0][0]}</strong> concentra mais entregas — potencial para anunciante local nessa região.</p>
          )}
          {dados.totalBoys > 0 && dados.totalEmpresas > 0 && (
            <p>📊 Média de {(dados.totalBoys / dados.totalEmpresas).toFixed(1)} motoboys por empresa. Se subir para 3+, o modelo de assinatura por boy fica mais interessante.</p>
          )}
          {dados.taxaTotalGeral > 0 && (
            <p>💰 R${dados.taxaTotalGeral.toFixed(2)} em taxas processadas. Esse volume justifica conversa com parceiros fintech quando chegar a R$10k/mês.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ListaEmpresas({ empresas, onSelecionar }) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [ordenacao, setOrdenacao] = useState('recente')

  const empresasFiltradas = empresas
    .filter(e => e.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(e => {
      if (filtroStatus === 'ativos') return e.ativo
      if (filtroStatus === 'inativos') return !e.ativo
      return true
    })
    .sort((a, b) => {
      if (ordenacao === 'nome_az') return a.nome.localeCompare(b.nome)
      if (ordenacao === 'nome_za') return b.nome.localeCompare(a.nome)
      if (ordenacao === 'recente') return new Date(b.created_at) - new Date(a.created_at)
      if (ordenacao === 'antigo') return new Date(a.created_at) - new Date(b.created_at)
      if (ordenacao === 'receita') return b.taxaTotal - a.taxaTotal
      if (ordenacao === 'entregas') return b.totalEntregas - a.totalEntregas
      return 0
    })

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>
        Empresas ({empresasFiltradas.length}{empresasFiltradas.length !== empresas.length ? ` de ${empresas.length}` : ''})
      </h2>

      <div style={{ marginBottom: 14 }}>
        <input
          placeholder="Buscar por nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ flex: 1 }}>
            <option value="todos">Todos os status</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
          <select value={ordenacao} onChange={e => setOrdenacao(e.target.value)} style={{ flex: 1 }}>
            <option value="recente">Cadastro: mais recente</option>
            <option value="antigo">Cadastro: mais antigo</option>
            <option value="nome_az">Nome: A-Z</option>
            <option value="nome_za">Nome: Z-A</option>
            <option value="receita">Mais receita</option>
            <option value="entregas">Mais entregas</option>
          </select>
        </div>
      </div>

      {empresasFiltradas.length === 0 && <p className="muted">Nenhuma empresa encontrada.</p>}
      {empresasFiltradas.map(e => (
        <div key={e.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => onSelecionar(e)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.nome}</div>
              <div className="muted">{e.cidade} · {e.endereco_saida}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {e.emailProfile} {e.whatsappProfile && <>· <WhatsAppLink numero={e.whatsappProfile} /></>}
              </div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: e.ativo ? '#22c55e22' : 'var(--bg-2)',
              color: e.ativo ? '#22c55e' : 'var(--text-3)'
            }}>
              {e.ativo ? '● ativo' : '○ inativo'}
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
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [ordenacao, setOrdenacao] = useState('recente')

  const boysFiltrados = boys
    .filter(b => b.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(b => {
      if (filtroStatus === 'ativos') return b.ativo
      if (filtroStatus === 'inativos') return !b.ativo
      return true
    })
    .sort((a, b) => {
      if (ordenacao === 'nome_az') return a.nome.localeCompare(b.nome)
      if (ordenacao === 'nome_za') return b.nome.localeCompare(a.nome)
      if (ordenacao === 'recente') return new Date(b.created_at) - new Date(a.created_at)
      if (ordenacao === 'antigo') return new Date(a.created_at) - new Date(b.created_at)
      if (ordenacao === 'receita') return b.taxaTotal - a.taxaTotal
      if (ordenacao === 'entregas') return b.totalEntregas - a.totalEntregas
      return 0
    })

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>
        Motoboys ({boysFiltrados.length}{boysFiltrados.length !== boys.length ? ` de ${boys.length}` : ''})
      </h2>

      <div style={{ marginBottom: 14 }}>
        <input
          placeholder="Buscar por nome..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ flex: 1 }}>
            <option value="todos">Todos os status</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
          <select value={ordenacao} onChange={e => setOrdenacao(e.target.value)} style={{ flex: 1 }}>
            <option value="recente">Cadastro: mais recente</option>
            <option value="antigo">Cadastro: mais antigo</option>
            <option value="nome_az">Nome: A-Z</option>
            <option value="nome_za">Nome: Z-A</option>
            <option value="receita">Mais recebido</option>
            <option value="entregas">Mais entregas</option>
          </select>
        </div>
      </div>

      {boysFiltrados.length === 0 && <p className="muted">Nenhum motoboy encontrado.</p>}
      {boysFiltrados.map(b => (
        <div key={b.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => onSelecionar(b)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{b.nome}</div>
              <div className="muted">{b.email} {b.whatsapp && <>· <WhatsAppLink numero={b.whatsapp} /></>}</div>
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
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>toque para ver detalhes</div>
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
          {empresa.whatsappProfile && <><WhatsAppLink numero={empresa.whatsappProfile} /><br /></>}
          <span style={{ color: 'var(--text-3)' }}>Cadastro: {formatarData(empresa.created_at)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <MetricCard label="Total entregas" value={empresa.totalEntregas} />
          <MetricCard label="Total km" value={`${empresa.kmTotal} km`} cor="var(--text-1)" />
          <MetricCard label="Taxas pagas" value={`R$${empresa.taxaTotal.toFixed(2)}`} />
          <MetricCard label="Turnos" value={empresa.totalTurnos} cor="var(--text-1)" />
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
          {empresa.totalEntregas === 0 && <p>⚠️ Sem entregas. Empresa pode estar no onboarding ou inativa.</p>}
          {parseFloat(mediaEntregasDia) > 0 && parseFloat(mediaEntregasDia) < 5 && (
            <p>📊 Média de {mediaEntregasDia} entregas/dia — volume baixo. Oportunidade: mostrar relatório de economia comparado com controle manual.</p>
          )}
          {parseFloat(mediaEntregasDia) >= 5 && (
            <p>✅ {mediaEntregasDia} entregas/dia — empresa ativa. Boa candidata para o plano de assinatura R$29/boy/dia.</p>
          )}
          {empresa.boysVinculados >= 3 && (
            <p>💰 {empresa.boysVinculados} boys vinculados. Receita potencial: R${(empresa.boysVinculados * 29 * 22).toLocaleString('pt-BR')}/mês.</p>
          )}
          {empresa.kmTotal > 0 && (
            <p>🛵 {empresa.kmTotal} km rodados — dado valioso para seguradora parceira.</p>
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
          {boy.email} {boy.whatsapp && <>· <WhatsAppLink numero={boy.whatsapp} /></>}<br />
          {boy.estabsVinculados?.length > 0 && (
            <span style={{ color: 'var(--text-3)' }}>Vínculos: {boy.estabsVinculados.join(', ')}</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
          {boy.totalEntregas === 0 && <p>⚠️ Sem entregas. Boy pode estar no onboarding ou inativo.</p>}
          {parseFloat(mediaTaxaDia) > 0 && parseFloat(mediaTaxaDia) < 50 && (
            <p>📊 Ganho médio de R${mediaTaxaDia}/dia — perfil de uso baixo.</p>
          )}
          {parseFloat(mediaTaxaDia) >= 50 && (
            <p>✅ R${mediaTaxaDia}/dia de ganho médio — boy ativo. Perfil ideal para parceiro fintech.</p>
          )}
          {parseFloat(mediaKmDia) > 30 && (
            <p>🛵 {mediaKmDia} km/dia em média — oportunidade para seguro por km ou parceiro mecânico.</p>
          )}
          {boy.estabsVinculados?.length > 1 && (
            <p>🔗 Atua em {boy.estabsVinculados.length} empresas — boy multiempresa, menor risco de churn.</p>
          )}
        </div>
      </div>
    </div>
  )
}