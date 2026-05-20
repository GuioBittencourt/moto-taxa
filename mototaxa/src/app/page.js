'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LoginScreen from '../components/LoginScreen'
import BoyHome from '../components/BoyHome'
import LojaHome from '../components/LojaHome'

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) carregarPerfil(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) carregarPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function carregarPerfil(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setPerfil(data)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 24, height: 24 }}></div>
    </div>
  )

  if (!session || !perfil) return (
    <LoginScreen onLogin={(p) => setPerfil(p)} />
  )

  if (perfil.tipo === 'estabelecimento') return (
    <LojaHome perfil={perfil} onLogout={handleLogout} />
  )

  return <BoyHome perfil={perfil} onLogout={handleLogout} />
}
