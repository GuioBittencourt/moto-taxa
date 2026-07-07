'use client'
import { useState, useEffect } from 'react'

const ESTADOS = [
  { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' }, { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' }, { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' }, { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' }, { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' }, { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' }, { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' }, { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' }, { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' }, { sigla: 'TO', nome: 'Tocantins' }
]

export function EstadoCidadeSelector({ estado, cidade, onChangeEstado, onChangeCidade, showBairro, bairro, onChangeBairro }) {
  const [cidadesDoEstado, setCidadesDoEstado] = useState([])
  const [carregandoCidades, setCarregandoCidades] = useState(false)
  const [erroCidades, setErroCidades] = useState(false)
  const [buscaCidade, setBuscaCidade] = useState(cidade || '')
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  useEffect(() => {
    if (!estado) { setCidadesDoEstado([]); return }
    setCarregandoCidades(true)
    setErroCidades(false)
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios`)
      .then(res => res.json())
      .then(data => {
        setCidadesDoEstado(data.map(m => m.nome).sort())
        setCarregandoCidades(false)
      })
      .catch(() => {
        setErroCidades(true)
        setCarregandoCidades(false)
      })
  }, [estado])

  function handleEstadoChange(novoEstado) {
    onChangeEstado(novoEstado)
    onChangeCidade('')
    setBuscaCidade('')
  }

  function handleBuscaCidade(texto) {
    setBuscaCidade(texto)
    onChangeCidade(texto) // sempre salva o que foi digitado, mesmo sem clicar numa sugestão
    setMostrarSugestoes(true)
  }

  function selecionarCidade(nomeCidade) {
    setBuscaCidade(nomeCidade)
    onChangeCidade(nomeCidade)
    setMostrarSugestoes(false)
  }

  const sugestoes = buscaCidade.length > 0
    ? cidadesDoEstado.filter(c => c.toLowerCase().includes(buscaCidade.toLowerCase())).slice(0, 8)
    : []

  return (
    <div>
      <label>Estado</label>
      <select value={estado} onChange={e => handleEstadoChange(e.target.value)} required>
        <option value="">Selecione o estado</option>
        {ESTADOS.map(uf => (
          <option key={uf.sigla} value={uf.sigla}>{uf.nome}</option>
        ))}
      </select>

      <label>Cidade</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={estado ? 'Digite pra buscar' : 'Selecione o estado primeiro'}
          value={buscaCidade}
          disabled={!estado}
          onChange={e => handleBuscaCidade(e.target.value)}
          onFocus={() => setMostrarSugestoes(true)}
          onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
        />
        {carregandoCidades && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Carregando cidades...</p>}
        {erroCidades && (
          <p style={{ fontSize: 12, color: 'var(--warn, #f59e0b)', marginTop: 4 }}>
            Não consegui carregar a lista de cidades. Pode digitar o nome manualmente.
          </p>
        )}
        {mostrarSugestoes && sugestoes.length > 0 && (
          <div
            className="card"
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              maxHeight: 200, overflowY: 'auto', padding: '0.25rem', marginTop: 4
            }}
          >
            {sugestoes.map(nome => (
              <div
                key={nome}
                onMouseDown={() => selecionarCidade(nome)}
                style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 14 }}
              >
                {nome}
              </div>
            ))}
          </div>
        )}
      </div>

      {showBairro && (
        <>
          <label>Bairro</label>
          <input type="text" placeholder="Seu bairro" value={bairro} onChange={e => onChangeBairro(e.target.value)} />
        </>
      )}
    </div>
  )
}