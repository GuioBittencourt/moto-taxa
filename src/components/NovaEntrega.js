'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularTaxa } from '../lib/engine'

function reduzirImagem(file, maxWidth, qualidade) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let w = img.width, h = img.height
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', qualidade))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function NovaEntrega({ userId, estabelecimento, turnoId, onConfirmado, onVoltar }) {
  const [modoInput, setModoInput] = useState('digitar')
  const [cliente, setCliente] = useState('')
  const [endDestino, setEndDestino] = useState('')
  const [bairroDestino, setBairroDestino] = useState('')
  const [cidadeDestino, setCidadeDestino] = useState('')
  const [km, setKm] = useState('')
  const [resultado, setResultado] = useState(null)
  const [lendoFoto, setLendoFoto] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [infoMaps, setInfoMaps] = useState('')
  const [fotoPreview, setFotoPreview] = useState(null)

  const regras = estabelecimento?.regras || {}
  const tipoCalculo = estabelecimento?.tipo_calculo || 'km'
  const modeMedicao = regras.mode_medicao || 'rua'
  const usaBairroFixo = tipoCalculo === 'bairro'
  const bairrosCadastrados = regras.bairros || []
  const cidadeEstab = estabelecimento?.cidade || 'São José dos Campos'

  async function lerFoto(file) {
    setLendoFoto(true); setErro(''); setInfoMaps('')
    try {
      const imagemReduzida = await reduzirImagem(file, 1200, 0.75)
      const b64 = imagemReduzida.split(',')[1]

      setFotoPreview(imagemReduzida)

      const resp = await fetch('/api/ler-comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mimeType: 'image/jpeg' })
      })
      const data = await resp.json()

      if (data.ok) {
        setCliente(data.data.cliente || '')
        setEndDestino(data.data.endereco_completo || data.data.rua || '')
        setBairroDestino(data.data.bairro || '')
        setCidadeDestino(data.data.cidade || cidadeEstab)
        setInfoMaps('Comanda lida. Clique em Calcular para obter o km.')
      } else {
        setErro('Não consegui ler a comanda: ' + (data.error || 'tente novamente'))
      }
    } catch (e) {
      setErro('Erro ao processar foto: ' + e.message)
    }
    setLendoFoto(false)
  }

  async function buscarKmMaps() {
    setInfoMaps('Calculando distância pelo Maps...')

    let origemMaps, destinoMaps

    if (modeMedicao === 'bairro') {
      const bairroOrigem = estabelecimento?.endereco_saida?.split(',')[0] || estabelecimento?.endereco_saida
      origemMaps = `${bairroOrigem}, ${cidadeEstab}, SP, Brasil`
      destinoMaps = `${bairroDestino || endDestino}, ${cidadeDestino || cidadeEstab}, SP, Brasil`
    } else {
      origemMaps = `${estabelecimento?.endereco_saida}, ${cidadeEstab}, SP, Brasil`
      destinoMaps = endDestino.includes(cidadeDestino || cidadeEstab)
        ? endDestino + ', SP, Brasil'
        : `${endDestino}, ${cidadeDestino || cidadeEstab}, SP, Brasil`
    }

    try {
      const resp = await fetch('/api/calcular-distancia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem: origemMaps, destino: destinoMaps, modeMedicao })
      })
      const data = await resp.json()

      if (data.ok) {
        setKm(String(data.km))
        setInfoMaps(`Maps: ${data.km} km (${data.duracao})`)
        return data.km
      } else {
        setInfoMaps('Maps não encontrou. Informe o km manualmente.')
        return 0
      }
    } catch {
      setInfoMaps('Erro ao consultar Maps. Informe o km manualmente.')
      return 0
    }
  }

  async function calcular() {
    setCalculando(true); setErro(''); setResultado(null)
    let distanciaKm = parseFloat(km) || 0

    if (!usaBairroFixo && distanciaKm === 0) {
      if (!endDestino && !bairroDestino) {
        setErro('Informe o endereço ou bairro de destino')
        setCalculando(false); return
      }
      distanciaKm = await buscarKmMaps()
    }

    if (distanciaKm === 0 && !usaBairroFixo) {
      setErro('Informe a distância em km manualmente')
      setCalculando(false); return
    }

    const r = calcularTaxa(distanciaKm, bairroDestino, regras)
    setResultado({ km: distanciaKm, ...r })
    setCalculando(false)
  }

  async function confirmar() {
    if (!resultado) return
    setSalvando(true)
    const { error } = await supabase.from('entregas').insert({
      turno_id: turnoId, boy_id: userId, estab_id: estabelecimento.id,
      cliente: cliente || 'Cliente',
      endereco_destino: endDestino,
      bairro_destino: bairroDestino,
      km: resultado.km, taxa: resultado.valor,
      descricao_calculo: resultado.descricao,
      tipo_calculo: tipoCalculo,
      status: 'pendente', origem: 'boy'
    })
    if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
    onConfirmado(resultado)
    setSalvando(false)
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>Nova entrega</h1>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '0 0 12px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {estabelecimento?.nome}
        <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>·</span>
        <span style={{ marginLeft: 6 }}>{estabelecimento?.endereco_saida}</span>
        {modeMedicao === 'bairro' && (
          <span style={{ marginLeft: 6, color: 'var(--yellow)', fontSize: 11 }}>· bairro a bairro</span>
        )}
      </div>

      <div className="card">
        <div className="tabs">
          <div className={`tab ${modoInput === 'digitar' ? 'active' : ''}`} onClick={() => setModoInput('digitar')}>
            Digitar
          </div>
          <div className={`tab ${modoInput === 'foto' ? 'active' : ''}`} onClick={() => setModoInput('foto')}>
            Foto da comanda <span className="ai-tag">IA</span>
          </div>
        </div>

        {modoInput === 'foto' && (
          <>
            <div className="upload-area" onClick={() => document.getElementById('foto-input').click()}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📷</div>
              {lendoFoto
                ? <><span className="spinner"></span>IA lendo a comanda...</>
                : 'Tirar foto ou selecionar imagem'}
            </div>
            <input
              type="file" id="foto-input"
              accept="image/*,image/heic,image/heif"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && lerFoto(e.target.files[0])}
            />
            {fotoPreview && (
              <img src={fotoPreview} style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 180, objectFit: 'cover' }} />
            )}
          </>
        )}

        <label>Cliente (opcional)</label>
        <input placeholder="Ex: João Silva" value={cliente} onChange={e => setCliente(e.target.value)} />

        {usaBairroFixo ? (
          <>
            <label>Bairro de destino</label>
            {bairrosCadastrados.length > 0 ? (
              <select value={bairroDestino} onChange={e => setBairroDestino(e.target.value)}>
                <option value="">Selecione o bairro...</option>
                {bairrosCadastrados.map(b => (
                  <option key={b.nome} value={b.nome}>{b.nome} — R${b.valor.toFixed(2)}</option>
                ))}
              </select>
            ) : (
              <input placeholder="Ex: Centro" value={bairroDestino} onChange={e => setBairroDestino(e.target.value)} />
            )}
          </>
        ) : (
          <>
            <label>Endereço de destino</label>
            <input
              placeholder={modeMedicao === 'bairro' ? 'Ex: Jardim Satélite' : 'Ex: Rua das Flores, 123'}
              value={endDestino}
              onChange={e => { setEndDestino(e.target.value); setInfoMaps(''); setKm('') }}
            />
            {modeMedicao === 'bairro' && (
              <>
                <label>Bairro de destino</label>
                <input
                  placeholder="Ex: Jardim Satélite"
                  value={bairroDestino}
                  onChange={e => { setBairroDestino(e.target.value); setInfoMaps(''); setKm('') }}
                />
              </>
            )}
            <label>Distância em km</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                type="number" placeholder="Vazio = calcular pelo Maps"
                step="0.1" value={km}
                onChange={e => setKm(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-outline btn-sm"
                style={{ marginTop: 0, padding: '0 14px', height: 42 }}
                onClick={calcular}
                disabled={calculando}
              >
                {calculando ? <span className="spinner"></span> : 'Calcular'}
              </button>
            </div>
            {infoMaps && (
              <p className="muted-sm" style={{ marginTop: 6, color: infoMaps.includes('Maps:') ? 'var(--green)' : 'var(--text-2)' }}>
                {infoMaps}
              </p>
            )}
          </>
        )}

        {usaBairroFixo && (
          <button className="btn btn-primary" onClick={calcular} disabled={calculando} style={{ marginTop: 14 }}>
            {calculando ? <><span className="spinner"></span>Calculando...</> : 'Calcular taxa'}
          </button>
        )}
      </div>

      {resultado && (
        <div className="card">
          <h2>Resultado</h2>
          <div className="grid2">
            <div className="metric">
              <div className="metric-val">{resultado.km > 0 ? resultado.km.toFixed(1) + ' km' : '—'}</div>
              <div className="metric-lbl">Distância</div>
            </div>
            <div className="metric">
              <div className="metric-val yellow">R${resultado.valor.toFixed(2)}</div>
              <div className="metric-lbl">Taxa</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>{resultado.descricao}</p>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando} style={{ marginTop: 14 }}>
            {salvando ? <><span className="spinner"></span>Salvando...</> : 'Confirmar entrega'}
          </button>
        </div>
      )}

      {erro && <div className="alert alert-warn">{erro}</div>}
    </div>
  )
}
