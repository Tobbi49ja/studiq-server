import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correct: { type: Number, required: true },
    explanation: { type: String, default: '' },
    topic: { type: String, default: '' }
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questions: { type: [questionSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Quiz', quizSchema);
