import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  rawText: { type: String, required: true },
  summary: { type: String, default: '' },
  topics: { type: [String], default: [] },
  keyPoints: { type: [String], default: [] },
  subject: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Note', noteSchema);
