import cors from 'cors';
import express from 'express';
import { mowTimeRouter } from './routes/mowTimeRouter.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/mow-time', mowTimeRouter);

export default app;

