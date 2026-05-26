'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function PaginaConvite() {
  const { codigo } = useParams()
  const router = useRouter()
  const [status, setStatus] = useState('carregando')
  const [convite, setConvite] = useState(null)
  const [estab, setEstab] = useState(null)

  useEffect(() => { verificar() }, [])

  async function verificar() {
    const { data: { session } } = await supabase.auth.getSession()

    const { data: conv } = await supabase
      .from('convites')
      .select('*, estabelecimentos(*)')
      .eq('codigo', codigo)
      .eq('status', 'pendente')
      .single()

    if (!conv) { setStatus('invalido'); return }
    setConvite(conv)
    setEstab(conv.estabelecimentos)

    if (!session) { setStatus('login'); return }

    const { data: perfil } = await supabase
      .from('profiles')
      .select('tipo')
      .eq('id', session.user.id)
      .single()

    if (perfil?.tipo !== 'boy') { setStatus('tipo-errado'); return }

    setStatus('pronto')
  }

  async function aceitar() {
    setStatus('aceitando')
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session.user.id

    // Verifica se vínculo já existe
    const { data: vincExist } = await supabase
      .from('vinculos')
      .select('id')
      .eq('boy_id', userId)
      .eq('estab_id', convite.estab_id)
      .single()

    if (!vincExist) {
      await supabase.from('vinculos').insert({
        boy_id: userId,
        estab_id: convite.estab_id,
        ativo: true,
        aceito_boy: true,
        aceito_loja: true
      })
    } else {
      await supabase.from('vinculos').update({
        ativo: true, aceito_boy: true, aceito_loja: true
      }).eq('id', vincExist.id)
    }

    await supabase.from('convites').update({
      status: 'aceito', boy_id: userId
    }).eq('id', convite.id)

    setStatus('aceito')
    setTimeout(() => router.push('/'), 2000)
  }

  if (status === 'carregando') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <span className="spinner"></span>
    </div>
  )

  if (status === 'invalido') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
      <h2>Convite inválido ou já utilizado</h2>
      <p className="muted">Este link não é mais válido.</p>
    </div>
  )

  if (status === 'tipo-errado') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <h2>Conta incompatível</h2>
      <p className="muted">Este convite é para motoboys. Faça login com uma conta de motoboy.</p>
    </div>
  )

  if (status === 'login') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
      <h2>Faça login para aceitar</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Você foi convidado para se vincular a <strong>{estab?.nome}</strong>.
        Faça login ou crie sua conta de motoboy para continuar.
      </p>
      <button className="btn btn-primary" onClick={() => router.push('/')}>Ir para login</button>
    </div>
  )

  if (status === 'aceito') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
      <h2>Vinculado!</h2>
      <p className="muted">Você está vinculado a <strong>{estab?.nome}</strong>. Redirecionando...</p>
    </div>
  )

  if (status === 'aceitando') return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <span className="spinner"></span>
      <p className="muted" style={{ marginTop: 12 }}>Vinculando...</p>
    </div>
  )

  return (
    <div style={{ padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/logo-horizontal.png" alt="MotoTaxa" style={{ maxWidth: 200, marginBottom: 16 }} />
        <h2>Convite de vínculo</h2>
        <p className="muted">Você foi convidado para se vincular a:</p>
        <div className="card" style={{ marginTop: 12, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{estab?.nome}</div>
          <div className="muted">{estab?.endereco_saida} · {estab?.cidade}</div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={aceitar}>Aceitar e vincular</button>
      <button className="btn btn-outline" onClick={() => router.push('/')}>Recusar</button>
    </div>
  )
}