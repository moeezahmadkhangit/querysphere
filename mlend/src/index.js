import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRouter from './routes/ai.js';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'QuerySphere MLend' }));
app.use('/', aiRouter);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  const hasKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';
  console.log(`\n🤖 QuerySphere MLend running on http://localhost:${PORT}`);
  console.log(hasKey ? '✅ OpenAI API key loaded' : '⚠️  No OpenAI key — add OPENAI_API_KEY to mlend/.env');
});
