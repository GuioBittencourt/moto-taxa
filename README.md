# MotoTaxa

Controle de taxas e fechamento para motoboys e estabelecimentos.

---

## Passo a passo para subir o projeto

### 1. Criar repositório no GitHub
1. Acesse github.com e crie um repositório novo chamado `mototaxa`
2. Deixa público ou privado, sem README

### 2. Clonar e subir o código
Abra o CMD na pasta onde quer salvar o projeto:
```
cd C:\Users\Guilherme
git clone https://github.com/SEU_USUARIO/mototaxa.git
cd mototaxa
```
Copie todos os arquivos deste projeto para dentro da pasta, então:
```
git add .
git commit -m "first commit"
git push origin main
```

### 3. Criar projeto no Supabase
1. Acesse supabase.com e crie um projeto novo chamado `mototaxa`
2. Vá em SQL Editor e cole todo o conteúdo de `supabase_schema.sql` e execute
3. Vá em Project Settings > API e copie:
   - Project URL
   - anon public key

### 4. Configurar variáveis de ambiente
Crie um arquivo `.env.local` na raiz do projeto:
```
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
ANTHROPIC_API_KEY=sua_chave_anthropic
GOOGLE_MAPS_API_KEY=  (deixar vazio por enquanto)
```

### 5. Testar localmente
```
npm install
npm run dev
```
Acesse http://localhost:3000

### 6. Deploy no Vercel
1. Acesse vercel.com e conecte o repositório GitHub `mototaxa`
2. Em Environment Variables, adicione as mesmas variáveis do `.env.local`
3. Deploy automático

---

## Estrutura do projeto
```
src/
  app/
    page.js              — entry point, auth e roteamento
    layout.js            — layout global
    globals.css          — estilos
    api/
      ler-comanda/       — IA lê foto da comanda
      interpretar-regras/ — IA interpreta texto de precificação
      calcular-distancia/ — Google Maps Distance Matrix
  components/
    LoginScreen.js        — login e cadastro
    BoyHome.js            — tela principal do motoboy
    LojaHome.js           — tela principal do estabelecimento
    CadastroEstabelecimento.js — cadastro com IA para regras
    NovaEntrega.js        — registro de entrega com foto
  lib/
    supabase.js           — cliente Supabase
    engine.js             — motor de cálculo de taxas
supabase_schema.sql       — tabelas e RLS
```

---

## Funcionalidades do MVP

**Motoboy:**
- Cadastro com email/senha
- Múltiplos estabelecimentos com regras diferentes
- Tipo de cálculo por estabelecimento: km real, bairro, taxa fixa, composta
- IA interpreta regras descritas em texto livre
- Registro de entrega: digitar ou foto da comanda (IA extrai endereço)
- Cálculo automático de taxa
- Turno com abertura/fechamento
- Relatório diário com total + taxa fixa

**Estabelecimento:**
- Dashboard de custo por motoboy
- Aprovação de entregas (duplo check)
- Relatório de fechamento

**IA integrada:**
- Leitura de foto de comanda → extrai cliente, endereço, bairro
- Interpretação de texto de precificação → monta estrutura de regras

**Google Maps:**
- Integração pronta, ativa quando a chave for configurada
