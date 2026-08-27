import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: '' },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  subjects: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
