'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LGPD_TEXT, LGPD_MARKETING_CONSENT_TEXT } from '../lib/lgpd'
import { EstadoCidadeSelector } from './EstadoCidadeSelector'

const TIPO_VEICULO_OPCOES = ['Moto', 'Bicicleta']
const TEMPO_DELIVERY_OPCOES = ['Menos de 6 meses', '6 meses a 1 ano', '1 a 2 anos', 'Mais de 2 anos']
const FAIXA_RENDA_OPCOES = ['Até 1 salário mínimo', '1 a 2 salários mínimos', '2 a 3 salários mínimos', 'Mais de 3 salários mínimos', 'Prefiro não informar']
const SEGMENTO_OPCOES = ['Restaurante', 'Lanchonete', 'Farmácia', 'Mercado/Conveniência', 'Outro']
const COMO_CONHECEU_OPCOES = ['Indicação', 'Redes sociais', 'Busca no Google', 'Outro']

export default function LoginScreen({ onLogin }) {
  const [modo, setModo] = useState('login')
  const [tipo, setTipo] = useState('boy')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [lgpdAceito, setLgpdAceito] = useState(false)
  const [lgpdMarketing, setLgpdMarketing] = useState(false)
  const [showTermos, setShowTermos] = useState(false)

  const [whatsapp, setWhatsapp] = useState('')

  const [tipoVeiculo, setTipoVeiculo] = useState('')
  const [tempoDelivery, setTempoDelivery] = useState('')
  const [lgpdDadosOpcionais, setLgpdDadosOpcionais] = useState(false)
  const [estado, setEstado] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [faixaRenda, setFaixaRenda] = useState('')

  const [segmento, setSegmento] = useState('')
  const [comoConheceu, setComoConheceu] = useState('')
  const [qtdMotoboysDia, setQtdMotoboysDia] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setErro('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) { setErro('Email ou senha incorretos'); setLoading(false); return }

    try {
      const res = await fetch('/api/get-ip')
      const json = await res.json()
      await supabase.from('acessos_log').insert({
        user_id: data.user.id,
        ip: json.ip || 'unknown'
      })
    } catch (logError) {
      console.warn('Não foi possível registrar log de acesso:', logError)
    }

    setLoading(false)
  }

  async function handleCadastro(e) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Informe seu nome'); return }
    if (!lgpdAceito) { setErro('Você precisa aceitar os Termos e a Política de Privacidade para continuar'); return }
    if (!whatsapp.trim()) { setErro('Informe seu WhatsApp'); return }

    if (tipo === 'boy') {
      if (!tipoVeiculo) { setErro('Selecione o tipo de veículo'); return }
      if (!tempoDelivery) { setErro('Selecione seu tempo no delivery'); return }
      if (lgpdDadosOpcionais && (!estado || !cidade.trim())) {
        setErro('Preencha estado e cidade, ou desmarque a opção de informar dados adicionais')
        return
      }
    } else {
      if (!segmento) { setErro('Selecione o segmento do estabelecimento'); return }
      if (!estado || !cidade.trim()) { setErro('Informe estado e cidade'); return }
      if (!comoConheceu) { setErro('Selecione como conheceu o app'); return }
      if (!qtdMotoboysDia) { setErro('Informe a quantidade de motoboys por dia'); return }
    }

    setLoading(true); setErro('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome: nome.trim(),
          tipo
        }
      }
    })

    if (error) { setErro(error.message); setLoading(false); return }

    if (data.user) {
      await new Promise(r => setTimeout(r, 500))

      let ip = 'unknown'
      try {
        const res = await fetch('/api/get-ip')
        const json = await res.json()
        ip = json.ip || 'unknown'
      } catch (ipError) {
        console.warn('Não foi possível capturar IP para registro LGPD:', ipError)
      }

      const updatePayload = {
        lgpd_aceito: true,
        lgpd_marketing: lgpdMarketing,
        lgpd_data: new Date().toISOString(),
        lgpd_ip: ip,
        whatsapp: whatsapp.trim()
      }

      if (tipo === 'boy') {
        updatePayload.tipo_veiculo = tipoVeiculo
        updatePayload.tempo_delivery = tempoDelivery
        updatePayload.lgpd_dados_opcionais_aceito = lgpdDadosOpcionais
        updatePayload.lgpd_dados_opcionais_data = lgpdDadosOpcionais ? new Date().toISOString() : null
        if (lgpdDadosOpcionais) {
          updatePayload.estado = estado
          updatePayload.cidade = cidade.trim()
          updatePayload.bairro = bairro.trim() || null
          updatePayload.faixa_renda = faixaRenda || null
        }
      } else {
        updatePayload.segmento = segmento
        updatePayload.estado = estado
        updatePayload.cidade = cidade.trim()
        updatePayload.como_conheceu = comoConheceu
        updatePayload.qtd_motoboys_dia = parseInt(qtdMotoboysDia, 10)
      }

      const { error: lgpdError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', data.user.id)

      if (lgpdError) {
        console.warn('Não foi possível salvar dados de cadastro:', lgpdError)
      }

      onLogin({ id: data.user.id, nome: nome.trim(), tipo, email })
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <img
          src="/logo-escudo.png"
          alt="MotoTaxa"
          style={{ width: 160, height: 'auto', display: 'block', margin: '0 auto 1rem', mixBlendMode: 'screen' }}
        />
        <p style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: '2px', textTransform: 'uppercase' }}>
          Calcule. Rode. Ganhe mais.
        </p>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div className="tabs">
          <div className={`tab ${modo === 'login' ? 'active' : ''}`} onClick={() => { setModo('login'); setErro('') }}>
            Entrar
          </div>
          <div className={`tab ${modo === 'cadastro' ? 'active' : ''}`} onClick={() => { setModo('cadastro'); setErro('') }}>
            Criar conta
          </div>
        </div>

        {modo === 'cadastro' && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Você é</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`btn ${tipo === 'boy' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setTipo('boy')}
              >
                Motoboy
              </button>
              <button
                type="button"
                className={`btn ${tipo === 'estabelecimento' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setTipo('estabelecimento')}
              >
                Estabelecimento
              </button>
            </div>
          </div>
        )}

        <form onSubmit={modo === 'login' ? handleLogin : handleCadastro}>
          {modo === 'cadastro' && (
            <>
              <label>Nome</label>
              <input type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(e.target.value)} required />
            </>
          )}
          <label>Email</label>
          <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <label>Senha</label>
          <input type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} />

          {modo === 'cadastro' && (
            <>
              <label>WhatsApp</label>
              <input type="tel" placeholder="(12) 90000-0000" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />

              {tipo === 'boy' && (
                <>
                  <label>Tipo de veículo</label>
                  <select value={tipoVeiculo} onChange={e => setTipoVeiculo(e.target.value)} required>
                    <option value="">Selecione</option>
                    {TIPO_VEICULO_OPCOES.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>

                  <label>Tempo no delivery</label>
                  <select value={tempoDelivery} onChange={e => setTempoDelivery(e.target.value)} required>
                    <option value="">Selecione</option>
                    {TEMPO_DELIVERY_OPCOES.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={lgpdDadosOpcionais}
                        onChange={e => setLgpdDadosOpcionais(e.target.checked)}
                        style={{ marginTop: 3 }}
                      />
                      <span>Desejo informar minha cidade/bairro e faixa de renda (opcional — ajuda a decidir onde expandir o app)</span>
                    </label>
                  </div>

                  {lgpdDadosOpcionais && (
                    <>
                      <EstadoCidadeSelector
                        estado={estado}
                        cidade={cidade}
                        bairro={bairro}
                        showBairro={true}
                        onChangeEstado={setEstado}
                        onChangeCidade={setCidade}
                        onChangeBairro={setBairro}
                      />
                      <label>Faixa de renda</label>
                      <select value={faixaRenda} onChange={e => setFaixaRenda(e.target.value)}>
                        <option value="">Selecione</option>
                        {FAIXA_RENDA_OPCOES.map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                    </>
                  )}
                </>
              )}

              {tipo === 'estabelecimento' && (
                <>
                  <label>Segmento</label>
                  <select value={segmento} onChange={e => setSegmento(e.target.value)} required>
                    <option value="">Selecione</option>
                    {SEGMENTO_OPCOES.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>

                  <EstadoCidadeSelector
                    estado={estado}
                    cidade={cidade}
                    showBairro={false}
                    onChangeEstado={setEstado}
                    onChangeCidade={setCidade}
                  />

                  <label>Como conheceu o app</label>
                  <select value={comoConheceu} onChange={e => setComoConheceu(e.target.value)} required>
                    <option value="">Selecione</option>
                    {COMO_CONHECEU_OPCOES.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>

                  <label>Quantidade de motoboys por dia</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 5"
                    value={qtdMotoboysDia}
                    onChange={e => setQtdMotoboysDia(e.target.value)}
                    required
                  />
                </>
              )}

              <div style={{ marginTop: 16, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    required
                    checked={lgpdAceito}
                    onChange={e => setLgpdAceito(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Li e aceito os{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermos(true)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#F5C107', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
                    >
                      Termos e a Política de Privacidade
                    </button>
                    {' '}(obrigatório)
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lgpdMarketing}
                    onChange={e => setLgpdMarketing(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>{LGPD_MARKETING_CONSENT_TEXT}</span>
                </label>
              </div>
            </>
          )}

          {erro && <div className="alert alert-warn" style={{ marginTop: 12 }}>{erro}</div>}

          <button className="btn btn-primary" type="submit" style={{ marginTop: 16 }} disabled={loading}>
            {loading ? <><span className="spinner"></span>Aguarde...</> : modo === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)' }}>MotoTaxa v1.0</p>

      {showTermos && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem', zIndex: 1000
          }}
          onClick={() => setShowTermos(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 12 }}>Termos e Política de Privacidade</h3>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>{LGPD_TEXT}</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowTermos(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}