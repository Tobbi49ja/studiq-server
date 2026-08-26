import AuditLog from '../models/AuditLog.js';

// Write an audit entry. `req` is optional — when absent, ip/email are skipped.
export async function audit(req, action, detail = '') {
  try {
    await AuditLog.create({
      userId: req?.user?.id || req?.body?.userId || undefined,
      email: req?.user?.email || req?.body?.email || '',
      action,
      detail: String(detail).slice(0, 500),
      ip: req?.ip || ''
    });
  } catch (err) {
    console.error('Audit write failed:', err.message);
  }
}
