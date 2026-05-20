import './globals.css'

export const metadata = {
  title: 'MotoTaxa',
  description: 'Controle de taxas e fechamento para motoboys',
  manifest: '/manifest.json',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app">
          {children}
        </div>
      </body>
    </html>
  )
}
