import mongoose from 'mongoose';

const topicScoreSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    correct: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  { _id: false }
);

const performanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note' },
  subject: { type: String, default: '' },
  topicScores: { type: [topicScoreSchema], default: [] },
  totalScore: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  timeTakenSeconds: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Performance', performanceSchema);
