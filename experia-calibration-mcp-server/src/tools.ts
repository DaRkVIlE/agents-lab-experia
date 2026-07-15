import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ManagerProfile, BotConfig } from './models';

export function registerTools(server: McpServer) {
  
  // 1. calibration_get_session
  server.tool(
    'calibration_get_session',
    'Obtém a sessão de onboarding/calibração atual do tenant',
    {
      manager_id: z.string().describe('O ID do tenant resolvido server-side via X-Tenant-Key')
    },
    async (args) => {
      try {
        const profile = await ManagerProfile.findOne({ manager_id: args.manager_id });
        if (!profile) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Tenant not found' }) }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({
            step: profile.onboarding_step,
            completed: profile.onboarding_completed,
            data: profile.onboarding_responses
          }) }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 2. calibration_save_step
  server.tool(
    'calibration_save_step',
    'Salva os dados de uma etapa específica da calibração (1-5)',
    {
      manager_id: z.string(),
      step: z.number().min(1).max(5),
      data: z.record(z.string(), z.any())
    },
    async (args) => {
      try {
        // Schema validation based on step could be extended here
        const profile = await ManagerProfile.findOne({ manager_id: args.manager_id });
        if (!profile) throw new Error('Tenant not found');

        profile.onboarding_responses = {
          ...profile.onboarding_responses,
          [`step_${args.step}`]: args.data
        };
        
        // Auto-map to config based on step (explicit casts needed — data is Record<string, any>)
        if (args.step === 1 && args.data['tone']) profile.config.tone = args.data['tone'] as string;
        if (args.step === 2 && args.data['services']) profile.config.services = args.data['services'] as string[];
        if (args.step === 3 && args.data['hours']) profile.config.hours = args.data['hours'];
        if (args.step === 4 && args.data['reservation_rules']) profile.config.reservation_rules = args.data['reservation_rules'] as string;
        if (args.step === 5 && args.data['examples']) profile.config.examples = args.data['examples'] as any[];

        profile.onboarding_step = args.step;
        if (args.step === 5) {
          profile.onboarding_completed = true;
        }

        await profile.save();
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, next_step: args.step < 5 ? args.step + 1 : 'complete' }) }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 3. calibration_compile_prompt
  server.tool(
    'calibration_compile_prompt',
    'Gera o system prompt final baseado nas 5 etapas concluídas',
    { manager_id: z.string() },
    async (args) => {
      try {
        const profile = await ManagerProfile.findOne({ manager_id: args.manager_id });
        if (!profile) throw new Error('Tenant not found');

        const { tone, services, hours, reservation_rules, examples } = profile.config;
        const prompt = `Você é o assistente virtual da ${profile.business_name}.
Tom de voz: ${tone || 'Profissional'}
Serviços: ${services.join(', ')}
Horários: ${JSON.stringify(hours)}
Regras: ${reservation_rules}

Exemplos de resposta:
${examples.map(ex => `Q: ${ex.customer}\nA: ${ex.reply}`).join('\n\n')}`;

        return { content: [{ type: 'text', text: prompt }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 4. calibration_publish_agent
  server.tool(
    'calibration_publish_agent',
    'Ativa o bot e salva a configuração. Target agent resolvido server-side.',
    { manager_id: z.string() },
    async (args) => {
      try {
        const profile = await ManagerProfile.findOne({ manager_id: args.manager_id });
        if (!profile) throw new Error('Tenant not found');

        profile.config.bot_status = 'active';
        await profile.save();

        const newConfig = new BotConfig({
          manager_id: profile.manager_id,
          config: profile.config,
          status: 'active'
        });
        await newConfig.save();

        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Agent published and activated successfully.' }) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 5. calibration_get_status
  server.tool(
    'calibration_get_status',
    'Verifica o status atual de ativação do agente',
    { manager_id: z.string() },
    async (args) => {
      try {
        const profile = await ManagerProfile.findOne({ manager_id: args.manager_id });
        if (!profile) throw new Error('Tenant not found');

        return { content: [{ type: 'text', text: JSON.stringify({ status: profile.config.bot_status }) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 6. calibration_list_tenants
  server.tool(
    'calibration_list_tenants',
    'Lista todos os tenants (admin only)',
    { _placeholder: z.string().optional() },
    async (_args) => {
      try {
        const profiles = await ManagerProfile.find({}, 'manager_id business_name config.bot_status');
        return { content: [{ type: 'text', text: JSON.stringify(profiles) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  // 7. calibration_register_tenant
  server.tool(
    'calibration_register_tenant',
    'Registra um novo gestor/tenant no sistema',
    {
      username: z.string(),
      business_name: z.string()
    },
    async (args) => {
      try {
        const manager_id = 'tenant_' + Math.random().toString(36).substr(2, 9);
        const profile = new ManagerProfile({
          manager_id,
          username: args.username,
          business_name: args.business_name
        });
        await profile.save();

        return { content: [{ type: 'text', text: JSON.stringify({ success: true, manager_id }) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
