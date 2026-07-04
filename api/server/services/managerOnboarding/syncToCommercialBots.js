/**
 * Faz a chamada HTTP para o motor comercial (commercial-ai-bots) usando fetch.
 */
async function syncToCommercialBots(clientId, businessName, onboardingData) {
    const baseUrl = process.env.COMMERCIAL_BOTS_INTERNAL_URL;
    const secret = process.env.INTERNAL_API_SECRET;

    if (!baseUrl || !secret) {
        throw new Error('Configuração ausente: COMMERCIAL_BOTS_INTERNAL_URL ou INTERNAL_API_SECRET');
    }

    const payload = {
        clientId,
        businessName,
        tone: onboardingData.tone,
        services: onboardingData.services,
        targetAudience: onboardingData.targetAudience,
        businessRules: onboardingData.businessRules,
        examples: onboardingData.examples,
        rawConfig: onboardingData.rawAssistantJson
    };

    const url = `${baseUrl.replace(/\/$/, '')}/internal/manager/calibrate`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro no bot comercial (${response.status}): ${errText}`);
    }

    return await response.json();
}

module.exports = { syncToCommercialBots };
