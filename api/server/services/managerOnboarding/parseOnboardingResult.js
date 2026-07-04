/**
 * Extrai o bloco JSON da última mensagem do assistente.
 * Faz fallback para buscar chaves balanceadas se o fence ```json não estiver presente.
 */
function parseOnboardingResult(text) {
    if (!text) return null;

    let jsonStr = null;

    // Tenta achar bloco ```json ... ```
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
        jsonStr = match[1];
    } else {
        // Tenta achar o primeiro { e o último }
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = text.substring(firstBrace, lastBrace + 1);
        }
    }

    if (!jsonStr) return null;

    try {
        const data = JSON.parse(jsonStr);

        // Normalização de chaves pt-BR -> en
        return {
            tone: data.tone || data.tom || 'neutro',
            services: data.services || data.servicos || [],
            targetAudience: data.targetAudience || data.publicoAlvo || '',
            businessRules: data.businessRules || data.regrasDeNegocio || {},
            examples: data.examples || data.exemplos || [],
            businessName: data.businessName || data.nomeDoNegocio || '',
            rawAssistantJson: data // Guarda o original por segurança
        };
    } catch (e) {
        console.error('[Onboarding Parser] Falha ao parsear JSON:', e.message);
        return null;
    }
}

module.exports = { parseOnboardingResult };
