import cors from 'cors';
import express from 'express';
import { googleRouter } from './routes/googleRouter.js';
import { mowTimeRouter } from './routes/mowTimeRouter.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/mow-time', mowTimeRouter);
app.use('/api/google', googleRouter);

export default app;

