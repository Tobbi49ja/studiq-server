import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  subject: { type: String, default: '' },
  topic: { type: String, default: '' },
  duration: { type: String, default: '' },
  activity: { type: String, default: '' }
}, { _id: false });

const dayPlanSchema = new mongoose.Schema({
  day: { type: Number, required: true },
  date: { type: String, default: '' },
  sessions: { type: [sessionSchema], default: [] }
}, { _id: false });

const studyPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mode: { type: String, enum: ['subject', 'all', 'ai', 'topic'], required: true },
  selectedSubject: { type: String, default: '' },
  customTopic: { type: String, default: '' },
  daysAvailable: { type: Number, default: 7 },
  weakTopics: { type: [String], default: [] },
  subjects: { type: [String], default: [] },
  plan: { type: [dayPlanSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

studyPlanSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('StudyPlan', studyPlanSchema);
