const express = require('express');
const router = express.Router();
const requireJwtAuth = require('../middleware/requireJwtAuth');
const ManagerProfile = require('../../models/ManagerProfile');
const { parseOnboardingResult } = require('../services/managerOnboarding/parseOnboardingResult');
const { syncToCommercialBots } = require('../services/managerOnboarding/syncToCommercialBots');

router.use(requireJwtAuth);

router.post('/complete', async (req, res) => {
    try {
        const { clientId, assistantMessage } = req.body;
        const userId = req.user.id; // Vem do JWT

        if (!clientId || !assistantMessage) {
            return res.status(400).json({ error: 'Faltam dados obrigatórios (clientId, assistantMessage)' });
        }

        // 1. Extrair os dados
        const parsedData = parseOnboardingResult(assistantMessage);
        if (!parsedData) {
            return res.status(400).json({ error: 'Não foi possível extrair o JSON da mensagem do assistente' });
        }

        const businessName = parsedData.businessName || clientId;

        // 2. Salvar no MongoDB do Painel (Usa findOneAndUpdate para atomicidade)
        const profile = await ManagerProfile.findOneAndUpdate(
            { clientId },
            {
                userId,
                clientId,
                businessName,
                onboarding: parsedData,
                $set: { 'syncStatus.lastSyncOk': false } // reset status before sync
            },
            { upsert: true, new: true }
        );

        try {
            // 3. Tentar sincronizar com o Postgres (commercial-ai-bots)
            await syncToCommercialBots(clientId, businessName, parsedData);
            profile.syncStatus.lastSyncOk = true;
            profile.syncStatus.lastSyncAt = new Date();
            await profile.save();

            return res.status(200).json({ 
                success: true, 
                message: 'Calibração salva e sincronizada com o bot em produção!' 
            });
        } catch (syncError) {
            console.error('[Onboarding] Erro ao sincronizar:', syncError.message);
            profile.syncStatus.lastSyncOk = false;
            profile.syncStatus.lastSyncAt = new Date();
            await profile.save();

            // Retorna 207 Multi-Status indicando que salvou local, mas a sync falhou
            return res.status(207).json({ 
                success: true, 
                warning: 'Salvo localmente, mas falhou ao sincronizar com produção. O painel tentará novamente mais tarde.',
                error: syncError.message
            });
        }
    } catch (error) {
        console.error('[Onboarding] Erro na rota /complete:', error.message);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// Rota de retry para sincronizações pendentes
router.post('/retry-sync/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const profile = await ManagerProfile.findOne({ clientId });
        
        if (!profile) {
            return res.status(404).json({ error: 'Perfil não encontrado' });
        }

        await syncToCommercialBots(clientId, profile.businessName, profile.onboarding);
        profile.syncStatus.lastSyncOk = true;
        profile.syncStatus.lastSyncAt = new Date();
        await profile.save();

        res.status(200).json({ success: true, message: 'Sincronização realizada com sucesso' });
    } catch (error) {
        console.error('[Onboarding Retry] Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
