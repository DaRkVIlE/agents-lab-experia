import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { registerTools } from './tools';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MCP Server Instance
const server = new McpServer({
  name: 'Experia Calibration Server',
  version: '1.0.0'
});

// Register all 7 tools
registerTools(server);

// SSE transport map — one per session
const transports = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
  const sessionId = (req.query.sessionId as string) || Math.random().toString(36).substring(7);
  const transport = new SSEServerTransport('/message', res);
  transports.set(sessionId, transport);

  await server.connect(transport);

  req.on('close', () => {
    transports.delete(sessionId);
    console.log(`[SSE] Session closed: ${sessionId}`);
  });
});

app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send('Session not found');
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: transports.size });
});

// Bootstrap: connect to MongoDB then start Express
const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');
    } else {
      console.warn('⚠️  No MONGODB_URI — starting without DB (tools will fail on DB calls)');
    }

    app.listen(PORT, () => {
      console.log(`🚀 Experia Calibration MCP Server → http://localhost:${PORT}`);
      console.log(`   SSE endpoint: /sse  |  Post: /message  |  Health: /health`);
    });
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap();
