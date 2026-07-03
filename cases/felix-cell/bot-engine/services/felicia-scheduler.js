/**
 * Felícia Scheduler — Felix Cell
 * ==============================
 * Jobs de retenção automática: remarketing, aniversário, pós-compra, VIP e datas especiais.
 *
 * Dependências: node-cron, pg, axios, dotenv
 * Instalar: npm install node-cron pg axios dotenv
 *
 * Variáveis de ambiente necessárias (.env):
 *   DATABASE_URL        → PostgreSQL no Railway (ex: postgresql://user:pass@host:port/db)
 *   EVOLUTION_API_URL   → URL base da Evolution API (ex: https://evolution.seudominio.com)
 *   EVOLUTION_API_KEY   → API Key da Evolution
 *   EVOLUTION_INSTANCE  → Nome da instância (ex: felixcell)
 *   FELIX_SITE_URL      → URL do site (ex: https://felixcell.netlify.app)
 */

require('dotenv').config();
const cron = require('node-cron');
const { Pool } = require('pg');
const axios = require('axios');

// ─── Conexão com PostgreSQL ───────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Config Evolution API ─────────────────────────────────────────────────────
const EVOLUTION = {
  url: process.env.EVOLUTION_API_URL,
  key: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE || 'felixcell',
};

const SITE_URL = process.env.FELIX_SITE_URL || 'https://felixcell.netlify.app';

// ─── Datas Especiais ──────────────────────────────────────────────────────────
const DATAS_ESPECIAIS = [
  { data: '12-10', nome: 'Dia das Crianças',  cupom: 'KIDS10',   desconto: '10%' },
  { data: '10-05', nome: 'Dia das Mães',      cupom: 'MAES15',   desconto: '15%' },
  { data: '12-06', nome: 'Dia dos Namorados', cupom: 'AMOR10',   desconto: '10%' },
  { data: '15-08', nome: 'Dia dos Pais',      cupom: 'PAIS15',   desconto: '15%' },
  { data: '27-11', nome: 'Black Friday',      cupom: 'BLACK20',  desconto: '20%' },
  { data: '25-12', nome: 'Natal',             cupom: 'NATAL10',  desconto: '10%' },
];

// ─── Utilitário: enviar mensagem via Evolution API ───────────────────────────
async function enviarMensagem(telefone, texto) {
  try {
    if (!EVOLUTION.url || !EVOLUTION.key) {
      console.log(`[MODO SIMULAÇÃO] Para ${telefone}:\n${texto}\n`);
      return { simulado: true };
    }

    const response = await axios.post(
      `${EVOLUTION.url}/message/sendText/${EVOLUTION.instance}`,
      {
        number: telefone,
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: texto },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION.key,
        },
      }
    );
    console.log(`[OK] Mensagem enviada para ${telefone}`);
    return response.data;
  } catch (err) {
    console.error(`[ERRO] Falha ao enviar para ${telefone}:`, err.message);
    return null;
  }
}

// ─── Registrar campanha enviada (evitar duplicatas) ───────────────────────────
async function registrarCampanha(telefone, tipo) {
  await db.query(
    `INSERT INTO felix_campanhas (telefone, tipo) VALUES ($1, $2)`,
    [telefone, tipo]
  );
}

async function campanhaJaEnviada(telefone, tipo, dentroDeHoras = 720) {
  // Verifica se já foi enviada nas últimas X horas (padrão: 30 dias)
  const result = await db.query(
    `SELECT id FROM felix_campanhas
     WHERE telefone = $1
       AND tipo = $2
       AND enviado_em > NOW() - INTERVAL '${dentroDeHoras} hours'
     LIMIT 1`,
    [telefone, tipo]
  );
  return result.rows.length > 0;
}

// ─── JOB 1: Remarketing 30 dias ──────────────────────────────────────────────
// Roda todo dia às 08:00
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Remarketing 30d iniciado...');
  try {
    const { rows: clientes } = await db.query(`
      SELECT telefone, nome FROM felix_clientes
      WHERE ultima_interacao < NOW() - INTERVAL '30 days'
        AND ultima_interacao IS NOT NULL
    `);

    for (const cliente of clientes) {
      const tipo = 'remarketing-30d';
      if (await campanhaJaEnviada(cliente.telefone, tipo)) continue;

      const nome = cliente.nome?.split(' ')[0] || 'amigo(a)';
      const msgs = [
        `Oi ${nome}! 👋 Faz um tempinho que a gente não se fala!\n\nTemos novidades na Félix Cell — novos acessórios e promoções especiais!\n\nVeja o catálogo: ${SITE_URL} 🛒\n\nQualquer dúvida, é só chamar! 😊`,
        `Olá ${nome}! Sentimos sua falta na Félix Cell! 💙\n\nQue tal aproveitar um cupom especial? Use *FELIX10* e ganhe *10% de desconto* — válido por 48 horas! 🎁\n\n${SITE_URL}`,
      ];

      // Alterna as mensagens para evitar repetição
      const msg = msgs[Math.floor(Math.random() * msgs.length)];
      await enviarMensagem(cliente.telefone, msg);
      await registrarCampanha(cliente.telefone, tipo);

      // Atualiza o campo de último remarketing
      await db.query(
        `UPDATE felix_clientes SET ultimo_remarketing = NOW() WHERE telefone = $1`,
        [cliente.telefone]
      );

      // Pausa entre disparos para não sobrecarregar
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[CRON] Remarketing 30d: ${clientes.length} clientes processados.`);
  } catch (err) {
    console.error('[CRON] Erro no remarketing 30d:', err.message);
  }
});

// ─── JOB 2: Aniversariantes do dia ───────────────────────────────────────────
// Roda todo dia às 09:00
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Aniversariantes iniciado...');
  try {
    const { rows: aniversariantes } = await db.query(`
      SELECT telefone, nome FROM felix_clientes
      WHERE EXTRACT(MONTH FROM aniversario) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(DAY FROM aniversario) = EXTRACT(DAY FROM NOW())
        AND aniversario IS NOT NULL
    `);

    for (const cliente of aniversariantes) {
      const tipo = 'aniversario';
      if (await campanhaJaEnviada(cliente.telefone, tipo, 24)) continue;

      const nome = cliente.nome?.split(' ')[0] || 'querido(a)';
      const msg = `🎂 Feliz aniversário, ${nome}! Toda a equipe da Félix Cell deseja um dia incrível!\n\nComo presente especial, preparamos um cupom exclusivo para você:\n*ANIVER15* — 15% de desconto válido hoje! 🎁\n\nAproveite: ${SITE_URL}`;

      await enviarMensagem(cliente.telefone, msg);
      await registrarCampanha(cliente.telefone, tipo);
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[CRON] Aniversariantes: ${aniversariantes.length} mensagens enviadas.`);
  } catch (err) {
    console.error('[CRON] Erro nos aniversariantes:', err.message);
  }
});

// ─── JOB 3: Pós-compra — Solicitar avaliação 24h após retirada ───────────────
// Roda a cada hora
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Pós-compra verificação iniciada...');
  try {
    const { rows: pedidos } = await db.query(`
      SELECT p.id, p.telefone, c.nome
      FROM felix_pedidos p
      LEFT JOIN felix_clientes c ON c.telefone = p.telefone
      WHERE p.status = 'retirado'
        AND p.created_at BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
        AND p.avaliacao IS NULL
    `);

    for (const pedido of pedidos) {
      const tipo = `pos-compra-${pedido.id}`;
      if (await campanhaJaEnviada(pedido.telefone, tipo, 48)) continue;

      const nome = pedido.nome?.split(' ')[0] || 'você';
      const msg = `Oi ${nome}! 😊 Esperamos que esteja gostando do produto da Félix Cell!\n\nPoderia nos dar uma avaliação rápida? Responda com um número:\n\n⭐ *1* — Ruim\n⭐⭐ *2* — Poderia melhorar\n⭐⭐⭐ *3* — Ok\n⭐⭐⭐⭐ *4* — Muito bom\n⭐⭐⭐⭐⭐ *5* — Excelente!\n\nSua opinião faz toda a diferença! 🙏`;

      await enviarMensagem(pedido.telefone, msg);
      await registrarCampanha(pedido.telefone, tipo);
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[CRON] Pós-compra: ${pedidos.length} avaliações solicitadas.`);
  } catch (err) {
    console.error('[CRON] Erro no pós-compra:', err.message);
  }
});

// ─── JOB 4: Fidelidade VIP ───────────────────────────────────────────────────
// Roda toda segunda-feira às 10:00
cron.schedule('0 10 * * 1', async () => {
  console.log('[CRON] Fidelidade VIP iniciado...');
  try {
    const { rows: clientes } = await db.query(`
      SELECT telefone, nome, total_compras FROM felix_clientes
      WHERE total_compras >= 5
        AND beneficio_vip_enviado = false
    `);

    for (const cliente of clientes) {
      const nome = cliente.nome?.split(' ')[0] || 'cliente';
      const msg = `${nome}, você é nosso cliente especial! 👑\n\nVocê já fez *${cliente.total_compras} compras* na Félix Cell — isso é incrível!\n\nComo reconhecimento pela sua fidelidade, liberamos:\n*VIP20* — 20% de desconto no seu próximo pedido! 🎁\n\nMuito obrigada por confiar na gente! 💙\n\n${SITE_URL}`;

      await enviarMensagem(cliente.telefone, msg);
      await db.query(
        `UPDATE felix_clientes SET beneficio_vip_enviado = true WHERE telefone = $1`,
        [cliente.telefone]
      );
      await registrarCampanha(cliente.telefone, 'vip');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[CRON] VIP: ${clientes.length} clientes premiados.`);
  } catch (err) {
    console.error('[CRON] Erro no VIP:', err.message);
  }
});

// ─── JOB 5: Datas Especiais ───────────────────────────────────────────────────
// Roda todo dia às 07:00
cron.schedule('0 7 * * *', async () => {
  console.log('[CRON] Datas especiais verificando...');
  try {
    const hoje = new Date();
    const ddMM = `${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const dataEspecial = DATAS_ESPECIAIS.find(d => d.data === ddMM);

    if (!dataEspecial) {
      console.log(`[CRON] Nenhuma data especial hoje (${ddMM}).`);
      return;
    }

    console.log(`[CRON] Data especial: ${dataEspecial.nome}! Disparando campanhas...`);

    const { rows: clientes } = await db.query(
      `SELECT telefone, nome FROM felix_clientes WHERE ultima_interacao IS NOT NULL`
    );

    for (const cliente of clientes) {
      const tipo = `data-especial-${dataEspecial.data}`;
      if (await campanhaJaEnviada(cliente.telefone, tipo, 24)) continue;

      const nome = cliente.nome?.split(' ')[0] || 'amigo(a)';
      const msg = `🎉 ${dataEspecial.nome}! ${nome}, aproveite!\n\nNa Félix Cell temos o presente perfeito para essa data especial.\nUse *${dataEspecial.cupom}* e ganhe *${dataEspecial.desconto} de desconto*! 🛒\n\n${SITE_URL}`;

      await enviarMensagem(cliente.telefone, msg);
      await registrarCampanha(cliente.telefone, tipo);
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`[CRON] Data especial ${dataEspecial.nome}: campanha disparada.`);
  } catch (err) {
    console.error('[CRON] Erro nas datas especiais:', err.message);
  }
});

// ─── Inicialização ────────────────────────────────────────────────────────────
async function init() {
  try {
    await db.query('SELECT 1');
    console.log('✅ Felícia Scheduler conectado ao banco de dados.');
    console.log('📅 Jobs ativos:');
    console.log('   • Remarketing 30d    → Diário às 08:00');
    console.log('   • Aniversariantes    → Diário às 09:00');
    console.log('   • Pós-compra 24h     → A cada hora');
    console.log('   • Fidelidade VIP     → Toda segunda às 10:00');
    console.log('   • Datas Especiais    → Diário às 07:00');
    console.log('\n🤖 Felícia Scheduler está rodando! Aguardando horários dos jobs...\n');
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL não configurada. Rodando em modo simulação.');
    }
  }
}

init();
