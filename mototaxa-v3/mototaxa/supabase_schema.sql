-- =============================================
-- MotoTaxa — Schema Supabase
-- Execute no SQL Editor do Supabase
-- =============================================

-- Perfis de usuário (motoboy ou estabelecimento)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('boy', 'estabelecimento')),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estabelecimentos cadastrados
CREATE TABLE estabelecimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco_saida TEXT NOT NULL,
  cidade TEXT DEFAULT 'São José dos Campos',
  taxa_fixa_turno NUMERIC(8,2) DEFAULT 0,
  tipo_calculo TEXT NOT NULL DEFAULT 'km' CHECK (tipo_calculo IN ('km', 'bairro', 'fixa', 'composta')),
  regras JSONB NOT NULL DEFAULT '{}',
  criado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vínculo motoboy <-> estabelecimento
CREATE TABLE vinculos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  boy_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  estab_id UUID REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(boy_id, estab_id)
);

-- Turnos (agrupa entregas de uma noite/período)
CREATE TABLE turnos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  boy_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  estab_id UUID REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  inicio TIMESTAMPTZ,
  fim TIMESTAMPTZ,
  taxa_fixa_turno NUMERIC(8,2) DEFAULT 0,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'aprovado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entregas individuais
CREATE TABLE entregas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno_id UUID REFERENCES turnos(id) ON DELETE CASCADE,
  boy_id UUID REFERENCES profiles(id),
  estab_id UUID REFERENCES estabelecimentos(id),
  cliente TEXT,
  endereco_destino TEXT,
  bairro_destino TEXT,
  km NUMERIC(6,2) DEFAULT 0,
  taxa NUMERIC(8,2) NOT NULL DEFAULT 0,
  descricao_calculo TEXT,
  tipo_calculo TEXT CHECK (tipo_calculo IN ('km', 'bairro', 'fixa', 'manual')),
  origem TEXT DEFAULT 'boy' CHECK (origem IN ('boy', 'estabelecimento')),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'divergencia')),
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;

-- Profiles: cada um vê só o seu
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Estabelecimentos: vê os que criou ou está vinculado
CREATE POLICY "estab_read" ON estabelecimentos
  FOR SELECT USING (
    criado_por = auth.uid() OR
    id IN (SELECT estab_id FROM vinculos WHERE boy_id = auth.uid() AND ativo = true)
  );
CREATE POLICY "estab_insert" ON estabelecimentos
  FOR INSERT WITH CHECK (criado_por = auth.uid());
CREATE POLICY "estab_update" ON estabelecimentos
  FOR UPDATE USING (criado_por = auth.uid());

-- Vínculos: motoboy vê os seus
CREATE POLICY "vinculos_own" ON vinculos
  FOR ALL USING (boy_id = auth.uid());

-- Turnos: boy vê os seus, estab vê os do seu estabelecimento
CREATE POLICY "turnos_read" ON turnos
  FOR SELECT USING (
    boy_id = auth.uid() OR
    estab_id IN (SELECT id FROM estabelecimentos WHERE criado_por = auth.uid())
  );
CREATE POLICY "turnos_write" ON turnos
  FOR INSERT WITH CHECK (boy_id = auth.uid());
CREATE POLICY "turnos_update" ON turnos
  FOR UPDATE USING (
    boy_id = auth.uid() OR
    estab_id IN (SELECT id FROM estabelecimentos WHERE criado_por = auth.uid())
  );

-- Entregas: boy vê as suas, estab vê as do seu estabelecimento
CREATE POLICY "entregas_read" ON entregas
  FOR SELECT USING (
    boy_id = auth.uid() OR
    estab_id IN (SELECT id FROM estabelecimentos WHERE criado_por = auth.uid())
  );
CREATE POLICY "entregas_write" ON entregas
  FOR INSERT WITH CHECK (
    boy_id = auth.uid() OR
    estab_id IN (SELECT id FROM estabelecimentos WHERE criado_por = auth.uid())
  );
CREATE POLICY "entregas_update" ON entregas
  FOR UPDATE USING (
    boy_id = auth.uid() OR
    estab_id IN (SELECT id FROM estabelecimentos WHERE criado_por = auth.uid())
  );
