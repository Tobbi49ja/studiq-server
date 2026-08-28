import AuditLog from '../models/AuditLog.js';

// Write an audit entry. `req` is optional — when absent, ip/email are skipped.
export async function audit(req, action, detail = '', metadata = {}) {
  try {
    await AuditLog.create({
      userId: req?.user?.id || req?.body?.userId || metadata.userId || undefined,
      email: req?.user?.email || req?.body?.email || metadata.email || '',
      action,
      detail: String(detail).slice(0, 500),
      ip: req?.ip || metadata.ip || '',
      userAgent: req?.headers?.['user-agent'] || metadata.userAgent || '',
      status: metadata.status || 'success',
      ...metadata.extra
    });
  } catch (err) {
    console.error('Audit write failed:', err.message);
  }
}

export async function auditLogin(req, email, success, reason = '') {
  await audit(req, success ? 'auth.login' : 'auth.login_failed', email, {
    status: success ? 'success' : 'failed',
    extra: reason ? { reason } : {}
  });
}

export async function auditLogout(req, email) {
  await audit(req, 'auth.logout', email);
}

export async function auditRegister(req, email, method = 'email') {
  await audit(req, `auth.register.${method}`, email);
}

export async function auditProfileUpdate(req, email, fields = []) {
  await audit(req, 'profile.update', `${email} — updated: ${fields.join(', ') || 'fields'}`);
}

export async function auditPageView(req, path) {
  await audit(req, 'page.view', path);
}

export async function auditNoteUpload(req, subject, title) {
  await audit(req, 'note.upload', `${subject} — ${title}`);
}

export async function auditQuizComplete(req, subject, score, total) {
  await audit(req, 'quiz.complete', `${subject} — ${score}/${total}`);
}

export async function auditStudyPlan(req, mode, subject = '') {
  await audit(req, 'studyplan.generate', `mode: ${mode}${subject ? ` — ${subject}` : ''}`);
}

export async function auditSubjectAdd(req, name) {
  await audit(req, 'subject.add', name);
}

export async function auditContactSubmit(req, email) {
  await audit(req, 'contact.submit', email);
}

export async function auditAdminAction(req, action, target) {
  await audit(req, `admin.${action}`, target);
}

export async function auditSecurity(req, action, detail) {
  await audit(req, `security.${action}`, detail, { status: 'warning' });
}
