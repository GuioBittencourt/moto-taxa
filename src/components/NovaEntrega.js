// NovaEntrega.js
'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularTaxa } from '../lib/engine'
import { rodarMatch } from '../lib/match'

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

export default function NovaEntrega({ userId, estabelecimento, turnoId, onConfirmado, onVoltar, origemOverride, entregaExistente }) {
  const editando = !!entregaExistente

  const [modoInput, setModoInput] = useState('digitar')
  const [cliente, setCliente] = useState(entregaExistente?.cliente || '')
  const [endDestino, setEndDestino] = useState(entregaExistente?.endereco_destino || '')
  const [bairroDestino, setBairroDestino] = useState(entregaExistente?.bairro_destino || '')
  const [cidadeDestino, setCidadeDestino] = useState('')
  const [km, setKm] = useState(entregaExistente?.km ? String(entregaExistente.km) : '')
  const [resultado, setResultado] = useState(
    entregaExistente ? { km: entregaExistente.km, valor: entregaExistente.taxa, descricao: entregaExistente.descricao_calculo } : null
  )
  const [lendoFoto, setLendoFoto] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  const [erro, setErro] = useState('')
  const [infoMaps, setInfoMaps] = useState('')
  const [fotoPreview, setFotoPreview] = useState(null)
  const [kmVeioDeCalculoAutomatico, setKmVeioDeCalculoAutomatico] = useState(false)
  const [confiancaCache, setConfiancaCache] = useState(null)

  // Lista de entregas pendentes (múltiplas)
  const [entregasPendentes, setEntregasPendentes] = useState([])
  const [adicionandoMais, setAdicionandoMais] = useState(false)

  const regras = estabelecimento?.regras || {}
  const tipoCalculo = estabelecimento?.tipo_calculo || 'km'
  const modeMedicao = regras.mode_medicao || 'rua'
  const usaBairroFixo = tipoCalculo === 'bairro'
  const bairrosCadastrados = regras.bairros || []
  const cidadeEstab = estabelecimento?.cidade || 'São José dos Campos'
  const bairroSaidaEstab = estabelecimento?.bairro_saida || ''
  const origem = origemOverride || 'boy'

  function limparFormulario() {
    setCliente(''); setEndDestino(''); setBairroDestino(''); setCidadeDestino('')
    setKm(''); setResultado(null); setInfoMaps(''); setFotoPreview(null)
    setKmVeioDeCalculoAutomatico(false); setConfiancaCache(null); setErro('')
  }

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
        const endLido = data.data.endereco_completo || data.data.rua || ''
        const bairroLido = data.data.bairro || ''
        const cidadeLida = data.data.cidade || cidadeEstab
        setCliente(data.data.cliente || '')
        setEndDestino(endLido)
        setBairroDestino(bairroLido)
        setCidadeDestino(cidadeLida)
        setInfoMaps('Comanda lida. Calculando distância...')
        await buscarKmMapsComDados(endLido, bairroLido, cidadeLida)
      } else {
        setErro('Não consegui ler a comanda: ' + (data.error || 'tente novamente'))
      }
    } catch (e) {
      setErro('Erro ao processar foto: ' + e.message)
    }
    setLendoFoto(false)
  }

  async function buscarKmMapsComDados(endDest, bairroDest, cidadeDest) {
    const endFinal = endDest !== undefined ? endDest : endDestino
    const bairroFinal = bairroDest !== undefined ? bairroDest : bairroDestino
    const cidadeFinal = cidadeDest !== undefined ? cidadeDest : (cidadeDestino || cidadeEstab)

    setInfoMaps('Calculando distância...')
    setConfiancaCache(null)

    let origemMaps, destinoMaps, ruaParaCache, bairroParaCache

    if (modeMedicao === 'bairro') {
      origemMaps = bairroSaidaEstab
        ? `${bairroSaidaEstab}, ${cidadeEstab}, SP, Brasil`
        : `${estabelecimento?.endereco_saida}, ${cidadeEstab}, SP, Brasil`
      const endBase = endFinal && endFinal.length > 5 ? endFinal : bairroFinal
      const jaTemCidade = endBase.toLowerCase().includes(cidadeFinal.toLowerCase())
      destinoMaps = jaTemCidade ? `${endBase}, SP, Brasil` : `${endBase}, ${cidadeFinal}, SP, Brasil`
      ruaParaCache = null
      bairroParaCache = bairroFinal || endBase
    } else {
      origemMaps = `${estabelecimento?.endereco_saida}, ${cidadeEstab}, SP, Brasil`
      const jaTemCidade = endFinal.toLowerCase().includes(cidadeFinal.toLowerCase())
      destinoMaps = jaTemCidade ? `${endFinal}, SP, Brasil` : `${endFinal}, ${cidadeFinal}, SP, Brasil`
      ruaParaCache = endFinal
      bairroParaCache = bairroFinal
    }

    try {
      const resp = await fetch('/api/calcular-distancia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origem: origemMaps, destino: destinoMaps, modeMedicao,
          estabId: estabelecimento?.id, rua: ruaParaCache, bairro: bairroParaCache, cidade: cidadeFinal
        })
      })
      const data = await resp.json()
      if (data.ok) {
        setKm(String(data.km))
        setKmVeioDeCalculoAutomatico(true)
        const r = calcularTaxa(data.km, bairroFinal, regras)
        setResultado({ km: data.km, ...r, endDestino: endFinal, bairroDestino: bairroFinal })
        const total = data.totalAmostras || 1
        if (data.deCache && total >= 3) {
          setInfoMaps(`📍 Endereço conhecido: ${data.km} km`)
          setConfiancaCache({ nivel: 'alta', total })
        } else if (data.deCache) {
          setInfoMaps(`Endereço já visto antes: ${data.km} km`)
          setConfiancaCache({ nivel: 'media', total })
        } else {
          setInfoMaps(`Maps: ${data.km} km (${data.duracao})`)
          setConfiancaCache({ nivel: 'nova', total: 1 })
        }
        return data.km
      } else {
        setInfoMaps('Não encontrado. Informe o km manualmente.')
        setKmVeioDeCalculoAutomatico(false)
        setConfiancaCache(null)
        return 0
      }
    } catch {
      setInfoMaps('Erro ao calcular. Informe o km manualmente.')
      setKmVeioDeCalculoAutomatico(false)
      setConfiancaCache(null)
      return 0
    }
  }

  async function calcular() {
    setCalculando(true); setErro(''); setResultado(null)
    let distanciaKm = parseFloat(km.toString().replace(',', '.')) || 0

    if (!usaBairroFixo && distanciaKm === 0) {
      if (!endDestino && !bairroDestino) {
        setErro('Informe o endereço ou bairro de destino')
        setCalculando(false); return
      }
      distanciaKm = await buscarKmMapsComDados()
    } else if (distanciaKm > 0) {
      setKmVeioDeCalculoAutomatico(false)
      const r = calcularTaxa(distanciaKm, bairroDestino, regras)
      setResultado({ km: distanciaKm, ...r, endDestino, bairroDestino })
    }

    if (distanciaKm === 0 && !usaBairroFixo) {
      setErro('Informe a distância em km manualmente')
      setCalculando(false); return
    }

    setCalculando(false)
  }

  function atualizarKm(valor) {
    setKm(valor)
    setKmVeioDeCalculoAutomatico(false)
    setConfiancaCache(null)
    const distanciaKm = parseFloat(valor.toString().replace(',', '.')) || 0
    if (distanciaKm > 0) {
      const r = calcularTaxa(distanciaKm, bairroDestino, regras)
      setResultado({ km: distanciaKm, ...r, endDestino, bairroDestino })
    } else {
      setResultado(null)
    }
  }

  async function salvarKmManualNoCache(kmFinal, endDest, bairroDest, cidadeDest) {
    if (usaBairroFixo || kmVeioDeCalculoAutomatico || !estabelecimento?.id || !kmFinal) return
    try {
      await fetch('/api/salvar-geocache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabId: estabelecimento.id,
          rua: modeMedicao === 'bairro' ? null : (endDest || endDestino),
          bairro: bairroDest || bairroDestino,
          cidade: cidadeDest || cidadeDestino || cidadeEstab,
          modoMedicao: modeMedicao,
          km: kmFinal
        })
      })
    } catch { }
  }

  // Adiciona entrega atual à lista de pendentes (sem salvar ainda)
  function adicionarEntregaNaLista() {
    if (!resultado) return
    setEntregasPendentes(prev => [...prev, {
      cliente: cliente || 'Cliente',
      endereco_destino: endDestino,
      bairro_destino: bairroDestino,
      cidade_destino: cidadeDestino || cidadeEstab,
      km: resultado.km,
      taxa: resultado.valor,
      descricao_calculo: resultado.descricao,
      kmManual: !kmVeioDeCalculoAutomatico
    }])
    limparFormulario()
    setAdicionandoMais(true)
  }

  // Confirma e salva todas as entregas de uma vez
  async function confirmarTodas() {
    const todasEntregas = resultado
      ? [...entregasPendentes, {
          cliente: cliente || 'Cliente',
          endereco_destino: endDestino,
          bairro_destino: bairroDestino,
          cidade_destino: cidadeDestino || cidadeEstab,
          km: resultado.km,
          taxa: resultado.valor,
          descricao_calculo: resultado.descricao,
          kmManual: !kmVeioDeCalculoAutomatico
        }]
      : entregasPendentes

    if (todasEntregas.length === 0) return
    setSalvando(true)

    for (const e of todasEntregas) {
      await salvarKmManualNoCache(e.km, e.endereco_destino, e.bairro_destino, e.cidade_destino)
      await supabase.from('entregas').insert({
        turno_id: turnoId, boy_id: userId, estab_id: estabelecimento.id,
        cliente: e.cliente,
        endereco_destino: e.endereco_destino,
        bairro_destino: e.bairro_destino,
        km: e.km, taxa: e.taxa,
        descricao_calculo: e.descricao_calculo,
        tipo_calculo: tipoCalculo,
        status: 'pendente',
        status_entrega: 'em_rota',
        origem
      })
    }

    await rodarMatch(turnoId)
    onConfirmado({ entregas: todasEntregas })
    setSalvando(false)
  }

  async function confirmar() {
    if (!resultado) return
    setSalvando(true)

    if (editando) {
      await salvarKmManualNoCache(resultado.km, endDestino, bairroDestino, cidadeDestino)
      const { error } = await supabase.from('entregas').update({
        cliente: cliente || 'Cliente',
        endereco_destino: endDestino,
        bairro_destino: bairroDestino,
        km: resultado.km,
        taxa: resultado.valor,
        descricao_calculo: resultado.descricao,
        status_check: 'pendente'
      }).eq('id', entregaExistente.id)
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
      await rodarMatch(turnoId)
      onConfirmado(resultado)
    } else {
      await confirmarTodas()
    }
    setSalvando(false)
  }

  async function apagarEntrega() {
    setApagando(true)
    await supabase.from('entregas').delete().eq('id', entregaExistente.id)
    await rodarMatch(turnoId)
    onConfirmado(null)
    setApagando(false)
  }

  const totalPendentes = entregasPendentes.reduce((s, e) => s + e.taxa, 0) + (resultado?.valor || 0)
  const qtdTotal = entregasPendentes.length + (resultado ? 1 : 0)

  return (
    <div style={{ padding: '0 1rem' }}>
      <div className="header" style={{ padding: '1rem 0 0.75rem' }}>
        <button className="back-btn" onClick={onVoltar}>←</button>
        <h1>{editando ? 'Editar entrega' : adicionandoMais ? `Entrega #${entregasPendentes.length + 1}` : 'Nova entrega'}</h1>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '0 0 12px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {estabelecimento?.nome}
        <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>·</span>
        <span style={{ marginLeft: 6 }}>{estabelecimento?.endereco_saida}</span>
        {bairroSaidaEstab && <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>· {bairroSaidaEstab}</span>}
        {modeMedicao === 'bairro' && <span style={{ marginLeft: 6, color: 'var(--yellow)', fontSize: 11 }}>· bairro a bairro</span>}
        {origem === 'loja' && <span style={{ marginLeft: 6, color: 'var(--yellow)', fontSize: 11 }}>· lançando como loja</span>}
      </div>

      {/* Lista de entregas já adicionadas */}
      {entregasPendentes.length > 0 && (
        <div className="card" style={{ marginBottom: 8 }}>
          <h2>Na fila ({entregasPendentes.length})</h2>
          {entregasPendentes.map((e, i) => (
            <div key={i} className="row">
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>#{i + 1} {e.cliente}</div>
                <div className="muted">{e.km > 0 ? e.km.toFixed(1) + ' km' : e.bairro_destino}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>R${e.taxa.toFixed(2)}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, padding: 4 }}
                  onClick={() => setEntregasPendentes(prev => prev.filter((_, idx) => idx !== i))}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {!editando && (
          <div className="tabs">
            <div className={`tab ${modoInput === 'digitar' ? 'active' : ''}`} onClick={() => setModoInput('digitar')}>Digitar</div>
            <div className={`tab ${modoInput === 'foto' ? 'active' : ''}`} onClick={() => setModoInput('foto')}>
              Foto da comanda <span className="ai-tag">IA</span>
            </div>
          </div>
        )}

        {modoInput === 'foto' && !editando && (
          <>
            <div className="upload-area" onClick={() => document.getElementById('foto-input').click()}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📷</div>
              {lendoFoto ? <><span className="spinner"></span>IA lendo a comanda...</> : 'Tirar foto ou selecionar imagem'}
            </div>
            <input type="file" id="foto-input" accept="image/*,image/heic,image/heif"
  style={{ display: 'none' }} onChange={e => e.target.files[0] && lerFoto(e.target.files[0])} />
            {fotoPreview && <img src={fotoPreview} style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 180, objectFit: 'cover' }} />}
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
              onChange={e => { setEndDestino(e.target.value); setInfoMaps(''); setKm(''); setKmVeioDeCalculoAutomatico(false); setConfiancaCache(null); setResultado(null) }}
            />
            {modeMedicao === 'bairro' && (
              <>
                <label>Bairro de destino</label>
                <input placeholder="Ex: Jardim Satélite" value={bairroDestino}
                  onChange={e => { setBairroDestino(e.target.value); setInfoMaps(''); setKm(''); setKmVeioDeCalculoAutomatico(false); setConfiancaCache(null); setResultado(null) }} />
              </>
            )}
            <label>Distância em km</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input type="number" placeholder="Vazio = calcular automaticamente"
                step="0.1" value={km}
                onChange={e => atualizarKm(e.target.value)}
                style={{ flex: 1 }} />
              <button className="btn btn-outline btn-sm"
                style={{ marginTop: 0, padding: '0 14px', height: 42 }}
                onClick={calcular} disabled={calculando}>
                {calculando ? <span className="spinner"></span> : 'Calcular'}
              </button>
            </div>
            {infoMaps && (
              <p className="muted-sm" style={{
                marginTop: 6,
                color: confiancaCache?.nivel === 'alta' ? 'var(--green)'
                  : confiancaCache?.nivel === 'media' ? 'var(--yellow)'
                  : (infoMaps.includes('Maps:')) ? 'var(--green)' : 'var(--text-2)'
              }}>
                {infoMaps}
              </p>
            )}
            {confiancaCache?.nivel === 'nova' && (
              <p className="muted-sm" style={{ marginTop: 2, color: 'var(--text-3)', fontSize: 11 }}>
                ⚠️ primeira vez neste endereço — confira a distância antes de confirmar
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

      {resultado && !editando && (
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
          {resultado.descricao && <p className="muted" style={{ marginTop: 8 }}>{resultado.descricao}</p>}

          {/* Botão adicionar outra entrega */}
          <button className="btn btn-outline" onClick={adicionarEntregaNaLista} style={{ marginTop: 14 }}>
            + Adicionar outra entrega
          </button>

          {/* Confirmar todas */}
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando} style={{ marginTop: 8 }}>
            {salvando
              ? <><span className="spinner"></span>Salvando...</>
              : qtdTotal > 1
                ? `Confirmar ${qtdTotal} entregas — R$${totalPendentes.toFixed(2)}`
                : 'Confirmar entrega'}
          </button>
        </div>
      )}

      {resultado && editando && (
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
          {resultado.descricao && <p className="muted" style={{ marginTop: 8 }}>{resultado.descricao}</p>}
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando} style={{ marginTop: 14 }}>
            {salvando ? <><span className="spinner"></span>Salvando...</> : 'Salvar alterações'}
          </button>
        </div>
      )}

      {editando && !resultado && (
        <div className="card">
          <p className="muted" style={{ marginBottom: 10 }}>Edite os campos acima e clique em Calcular para recalcular a taxa, ou salve diretamente se só alterou o cliente.</p>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? <><span className="spinner"></span>Salvando...</> : 'Salvar alterações'}
          </button>
        </div>
      )}

      {editando && (
        <div className="card">
          {confirmandoApagar ? (
            <>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>Apagar este lançamento?</p>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>O match será recalculado automaticamente.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm"
                  style={{ flex: 1, marginTop: 0, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                  onClick={apagarEntrega} disabled={apagando}>
                  {apagando ? <span className="spinner"></span> : 'Sim, apagar'}
                </button>
                <button className="btn btn-sm btn-outline" style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setConfirmandoApagar(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <button className="btn btn-outline"
              style={{ color: 'var(--red)', borderColor: 'var(--red)', fontSize: 13 }}
              onClick={() => setConfirmandoApagar(true)}>
              Apagar lançamento
            </button>
          )}
        </div>
      )}

      {erro && <div className="alert alert-warn">{erro}</div>}
    </div>
  )
}
