import express from 'express';
import path from 'path';
import composeRoutes from './routes/composeRoutes.ts';

const app = express();
app.use(express.json());

// API
app.use('/api', composeRoutes);

// Static client
app.use(express.static(path.join(import.meta.dirname, '..', 'client')));

// 404 for non-file routes → serve index.html so the page loads
app.use((_req, res) => {
  res.sendFile(path.join(import.meta.dirname, '..', 'client', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Middleware Composer listening on http://localhost:${PORT}`);
});
