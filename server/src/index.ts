import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dashboardRouter } from './routes/dashboard.js';
import { expenditureRouter } from './routes/expenditure.js';
import { trendRouter } from './routes/trend.js';
import { logsRouter } from './routes/logs.js';
import { strategyRouter } from './routes/strategy.js';
import { profileRouter } from './routes/profile.js';
import { scaleWeightRouter } from './routes/scaleWeight.js';
import { authRouter } from './routes/auth.js';

import { prisma } from './db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/expenditure', expenditureRouter);
app.use('/api/trend', trendRouter);
app.use('/api/scale-weight', scaleWeightRouter);
app.use('/api/logs', logsRouter);
app.use('/api/strategy', strategyRouter);
app.use('/api/profile', profileRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const server = app.listen(port, () => {
  console.log(`MacroFactor API Server running on http://localhost:${port}`);
});

const shutdown = async (signal: string) => {
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore error on disconnect
    }
    process.exit(0);
  });

  // Fallback force exit after 1s if sockets remain open
  setTimeout(() => {
    process.exit(0);
  }, 1000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
