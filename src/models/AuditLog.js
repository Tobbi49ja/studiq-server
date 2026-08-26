import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  email: { type: String, default: '' },
  action: { type: String, required: true, index: true },
  detail: { type: String, default: '' },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});

export default mongoose.model('AuditLog', auditLogSchema);
