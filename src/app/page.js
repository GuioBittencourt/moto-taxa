'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LoginScreen from '../components/LoginScreen'
import BoyHome from '../components/BoyHome'
import LojaHome from '../components/LojaHome'
import AdminHome from '../components/AdminHome'

const ADMIN_EMAIL = 'guilherme_fvb@hotmail.com'

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erroAuth, setErroAuth] = useState('')
  const [mostraAdmin, setMostraAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) carregarPerfil(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) carregarPerfil(session.user.id)
      else { setPerfil(null); setLoading(false); setMostraAdmin(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function carregarPerfil(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', userId).single()
      if (error) { setErroAuth('Erro ao carregar perfil: ' + error.message); setLoading(false); return }
      if (!data) { setErroAuth('Perfil não encontrado.'); setLoading(false); return }
      setPerfil(data)
    } catch (e) {
      setErroAuth('Erro inesperado: ' + e.message)
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setPerfil(null); setErroAuth(''); setMostraAdmin(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }}></div>
    </div>
  )

  if (erroAuth) return (
    <div style={{ padding: '2rem', maxWidth: 400, margin: '0 auto', paddingTop: '4rem' }}>
      <div className="alert alert-warn" style={{ marginBottom: 16 }}>{erroAuth}</div>
      <button className="btn btn-primary" onClick={handleLogout}>Voltar para o login</button>
    </div>
  )

  if (!session || !perfil) return <LoginScreen onLogin={(p) => setPerfil(p)} />

  const isAdmin = session.user.email === ADMIN_EMAIL

  if (isAdmin && mostraAdmin) return (
    <AdminHome perfil={perfil} onLogout={handleLogout} onVoltar={() => setMostraAdmin(false)} />
  )

  if (perfil.tipo === 'estabelecimento') return (
    <LojaHome perfil={perfil} onLogout={handleLogout} />
  )

  return (
    <BoyHome
      perfil={perfil}
      onLogout={handleLogout}
      isAdmin={isAdmin}
      onAbrirAdmin={() => setMostraAdmin(true)}
    />
  )
}
