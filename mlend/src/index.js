import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRouter from './routes/ai.js';
import { getApiKey, MODELS } from './openrouter.js';
import { startKeepAlive, keepAliveStatus } from './keepAlive.js';
import { allowedOrigins } from './allowedOrigins.js';

dotenv.config();

const app = express();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({
    status: 'ok',
    service: 'QuerySphere MLend',
    provider: 'openrouter',
    keyConfigured: !!getApiKey(),
    keepAlive: keepAliveStatus(),
    models: MODELS,
  }),
);
app.use('/', aiRouter);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`\n🤖 QuerySphere MLend running on http://localhost:${PORT}`);
  if (getApiKey()) {
    console.log(`✅ OpenRouter key loaded — free-model cascade: ${MODELS.join(' → ')}`);
  } else {
    console.log('⚠️  No OpenRouter key — add OPENROUTER_API_KEY to mlend/.env (local fallbacks still work)');
  }
  console.log(`🔓 Allowed origins: ${allowedOrigins.join(', ')}`);
  startKeepAlive();
});
