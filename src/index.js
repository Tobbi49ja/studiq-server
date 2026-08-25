import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import quizRoutes from './routes/quiz.js';
import performanceRoutes from './routes/performance.js';
import subjectRoutes from './routes/subjects.js';
import askRoutes from './routes/ask.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ data: { status: 'ok', service: 'studiq-server' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/admin', adminRoutes);

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function tryConnect(uri, label) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB connected (${label})`);
    return true;
  } catch (err) {
    console.warn(`MongoDB connection failed (${label}): ${err.message}`);
    return false;
  }
}

async function start() {
  const atlasUri = process.env.MONGO_URI;
  const localUri =
    process.env.LOCAL_MONGO_URI ||
    process.env.MONGO_LOCAL_URI ||
    'mongodb://localhost:27017/studiq';

  const connected =
    (atlasUri && (await tryConnect(atlasUri, 'Atlas'))) ||
    (await tryConnect(localUri, 'local'));

  if (!connected) {
    console.error('Failed to connect to MongoDB (Atlas and local).');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Studiq API running on http://localhost:${PORT}`);
  });
}

start();
