-- ============================================================
-- Schema PostgreSQL — Félix Cell Bot (Felícia)
-- Railway PostgreSQL
-- ============================================================

-- ── Tabela de Clientes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS felix_clientes (
  id                    SERIAL PRIMARY KEY,
  telefone              VARCHAR(20) UNIQUE NOT NULL,  -- ex: 5511987654321
  nome                  VARCHAR(100),
  aniversario           DATE,                          -- ex: 1995-07-15
  total_compras         INT DEFAULT 0,
  ultima_interacao      TIMESTAMP,
  ultimo_remarketing    TIMESTAMP,
  beneficio_vip_enviado BOOLEAN DEFAULT false,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE felix_clientes IS 'Clientes registrados via bot WhatsApp da Félix Cell';
COMMENT ON COLUMN felix_clientes.telefone IS 'Número no formato internacional sem + (ex: 5511987654321)';

-- ── Tabela de Pedidos/Retiradas ───────────────────────────────
CREATE TABLE IF NOT EXISTS felix_pedidos (
  id               SERIAL PRIMARY KEY,
  telefone         VARCHAR(20) NOT NULL,
  codigo_retirada  VARCHAR(10),                       -- ex: #4A2F
  itens            JSONB,                              -- array de { sku, nome }
  cupom            VARCHAR(20),
  status           VARCHAR(20) DEFAULT 'pendente',    -- pendente | confirmado | retirado | avaliado
  avaliacao        SMALLINT CHECK (avaliacao BETWEEN 1 AND 5),
  avaliacao_texto  TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (telefone) REFERENCES felix_clientes(telefone) ON DELETE CASCADE
);

COMMENT ON TABLE felix_pedidos IS 'Pedidos realizados via site/bot e seu status de retirada';

-- ── Tabela de Campanhas Disparadas ────────────────────────────
CREATE TABLE IF NOT EXISTS felix_campanhas (
  id          SERIAL PRIMARY KEY,
  telefone    VARCHAR(20) NOT NULL,
  tipo        VARCHAR(60) NOT NULL,                   -- remarketing-30d | aniversario | pos-compra-{id} | vip | data-especial-{ddMM}
  enviado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campanhas_tel_tipo ON felix_campanhas(telefone, tipo);
CREATE INDEX IF NOT EXISTS idx_campanhas_enviado ON felix_campanhas(enviado_em);

COMMENT ON TABLE felix_campanhas IS 'Log de campanhas enviadas para evitar duplicatas';

-- ── Tabela de Avaliações (desnormalizada para relatórios) ─────
CREATE TABLE IF NOT EXISTS felix_avaliacoes (
  id          SERIAL PRIMARY KEY,
  pedido_id   INT REFERENCES felix_pedidos(id),
  telefone    VARCHAR(20),
  nota        SMALLINT CHECK (nota BETWEEN 1 AND 5),
  comentario  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Trigger: atualiza updated_at automaticamente ──────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON felix_clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON felix_pedidos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Trigger: incrementa total_compras ao confirmar retirada ───
CREATE OR REPLACE FUNCTION incrementar_compras()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'retirado' AND OLD.status != 'retirado' THEN
    UPDATE felix_clientes
    SET total_compras = total_compras + 1,
        ultima_interacao = NOW()
    WHERE telefone = NEW.telefone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedido_retirado
  AFTER UPDATE ON felix_pedidos
  FOR EACH ROW EXECUTE FUNCTION incrementar_compras();

-- ── Views úteis ────────────────────────────────────────────────

-- Clientes VIP (5+ compras)
CREATE OR REPLACE VIEW vw_clientes_vip AS
SELECT
  id, telefone, nome, total_compras, ultima_interacao, beneficio_vip_enviado
FROM felix_clientes
WHERE total_compras >= 5
ORDER BY total_compras DESC;

-- Clientes inativos há 30+ dias
CREATE OR REPLACE VIEW vw_clientes_inativos AS
SELECT
  id, telefone, nome, ultima_interacao,
  EXTRACT(DAY FROM NOW() - ultima_interacao)::INT AS dias_sem_interacao
FROM felix_clientes
WHERE ultima_interacao < NOW() - INTERVAL '30 days'
ORDER BY ultima_interacao ASC;

-- Aniversariantes do mês atual
CREATE OR REPLACE VIEW vw_aniversariantes_mes AS
SELECT
  id, telefone, nome, aniversario,
  EXTRACT(DAY FROM aniversario)::INT AS dia
FROM felix_clientes
WHERE EXTRACT(MONTH FROM aniversario) = EXTRACT(MONTH FROM NOW())
ORDER BY EXTRACT(DAY FROM aniversario);

-- Resumo de avaliações por período
CREATE OR REPLACE VIEW vw_media_avaliacoes AS
SELECT
  DATE_TRUNC('month', created_at) AS mes,
  ROUND(AVG(nota), 2)             AS media,
  COUNT(*)                        AS total
FROM felix_avaliacoes
GROUP BY 1
ORDER BY 1 DESC;

-- ── Dados iniciais de teste ────────────────────────────────────
INSERT INTO felix_clientes (telefone, nome, aniversario, total_compras, ultima_interacao)
VALUES
  ('5511985031424', 'Félix (Gestor)', NULL, 0, NOW()),
  ('5511900000001', 'Cliente Teste', '1990-07-03', 6, NOW() - INTERVAL '35 days')
ON CONFLICT (telefone) DO NOTHING;
