'use client'
import { useState, useEffect } from 'react'

const SLIDES = {
  boy: [
    { titulo: 'Bem-vindo ao MotoTaxa!', texto: 'Controle suas entregas e turnos em um só lugar.' },
    { titulo: 'Leitura automática', texto: 'Tire uma foto da comanda — a IA calcula a rota e o valor automaticamente.' },
    { titulo: 'Duplo check', texto: 'Confira suas entregas lado a lado com a loja pra garantir que bate tudo.' },
    { titulo: 'Fechamento rápido', texto: 'Feche seu turno e compartilhe o relatório direto no WhatsApp.' }
  ],
  estabelecimento: [
    { titulo: 'Bem-vindo ao MotoTaxa!', texto: 'Gerencie seus motoboys e turnos com facilidade.' },
    { titulo: 'Convide motoboys', texto: 'Convide motoboys com um link e aprove os vínculos em segundos.' },
    { titulo: 'Acompanhe em tempo real', texto: 'Abra turnos e acompanhe entregas em tempo real, sem perder tempo conferindo cada corrida na mão.' },
    { titulo: 'Menos gestão, mais vendas', texto: 'Feche o turno com duplo check automático — menos tempo gerenciando entregas, mais tempo pra vender.' }
  ]
}

function chaveDismiss(userId) { return `mototaxa_onboarding_dismissed_${userId}` }
function chaveSkip(userId) { return `mototaxa_onboarding_skip_${userId}` }

export function useOnboarding(userId) {
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (!userId) return
    let dismissed = null
    let skipped = null
    try {
      dismissed = localStorage.getItem(chaveDismiss(userId))
      skipped = sessionStorage.getItem(chaveSkip(userId))
    } catch (err) {
      // Se o navegador bloquear storage por algum motivo, apenas não mostra automaticamente
      return
    }
    if (!dismissed && !skipped) setMostrar(true)
  }, [userId])

  function abrir() { setMostrar(true) }
  function fechar() { setMostrar(false) }

  return { mostrar, abrir, fechar }
}

export default function OnboardingModal({ tipo, userId, onFechar }) {
  const [slide, setSlide] = useState(0)
  const slides = SLIDES[tipo] || SLIDES.boy
  const ultimo = slide === slides.length - 1

  function pular() {
    try { sessionStorage.setItem(chaveSkip(userId), '1') } catch (err) {}
    onFechar()
  }

  function naoVerMais() {
    try { localStorage.setItem(chaveDismiss(userId), '1') } catch (err) {}
    onFechar()
  }

  function proximo() {
    if (ultimo) { naoVerMais(); return }
    setSlide(s => s + 1)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', zIndex: 2000
    }}>
      <div className="card" style={{ maxWidth: 340, width: '100%', padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === slide ? 'var(--yellow)' : 'var(--bg-2)'
            }} />
          ))}
        </div>

        <h2 style={{ marginBottom: 8 }}>{slides[slide].titulo}</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          {slides[slide].texto}
        </p>

        <button className="btn btn-primary" style={{ marginTop: 0 }} onClick={proximo}>
          {ultimo ? 'Começar' : 'Próximo'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <button onClick={pular}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 4 }}>
            Pular
          </button>
          <button onClick={naoVerMais}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: 4 }}>
            Não quero ver mais
          </button>
        </div>
      </div>
    </div>
  )
}