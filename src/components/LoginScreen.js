'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginScreen({ onLogin }) {
  const [modo, setModo] = useState('login')
  const [tipo, setTipo] = useState('boy')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('Email ou senha incorretos')
    setLoading(false)
  }

  async function handleCadastro(e) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Informe seu nome'); return }
    setLoading(true); setErro('')
    const { data, error } = await supabase.auth.signUp({ email, password: senha })
    if (error) { setErro(error.message); setLoading(false); return }
    if (data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, nome: nome.trim(), tipo, email })
      onLogin({ id: data.user.id, nome, tipo, email })
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

          {erro && <div className="alert alert-warn" style={{ marginTop: 12 }}>{erro}</div>}

          <button className="btn btn-primary" type="submit" style={{ marginTop: 16 }} disabled={loading}>
            {loading ? <><span className="spinner"></span>Aguarde...</> : modo === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)' }}>MotoTaxa v1.0</p>
    </div>
  )
}
