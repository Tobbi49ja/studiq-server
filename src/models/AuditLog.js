import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  email: { type: String, default: '', index: true },
  action: { type: String, required: true, index: true },
  detail: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  status: { type: String, default: 'success', index: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
