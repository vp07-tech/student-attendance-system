const m = require('mongoose'), S = m.Schema, ref = n => ({ type: S.Types.ObjectId, ref: n });
const mk = (n, d, opt) => m.model(n, new S(d, { timestamps: true, ...opt }));
exports.User = mk('User', { name: String, email: { type: String, unique: true, lowercase: true }, passwordHash: String,
  role: { type: String, enum: ['student', 'faculty', 'admin'] }, studentId: { type: String, unique: true, sparse: true },
  department: String, year: String, division: String, status: { type: String, default: 'Active' } });
exports.Subject = mk('Subject', { name: String, code: String, faculty: ref('User'), department: String, semester: Number });
exports.Session = mk('AttendanceSession', { subject: String, facultyId: ref('User'), className: String, division: String,
  startTime: Date, endTime: Date, status: { type: String, default: 'active' } });
exports.QrToken = mk('QrToken', { sessionId: ref('AttendanceSession'), token: { type: String, index: true },
  expiresAt: Date, usedStatus: { type: Boolean, default: false } });
const A = mk('Attendance', { studentId: ref('User'), sessionId: ref('AttendanceSession'), subject: String, date: Date,
  status: { type: String, enum: ['Present', 'Absent', 'Late'] }, method: { type: String, enum: ['QR', 'Manual'] },
  verificationStatus: String, changedBy: ref('User') });
A.schema.index({ studentId: 1, sessionId: 1 }, { unique: true, partialFilterExpression: { method: 'QR' } }); // DB-level duplicate guard
exports.Attendance = A;
exports.SecurityEvent = mk('SecurityEvent', { studentId: ref('User'), sessionId: ref('AttendanceSession'), eventType: String,
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High'] }, details: String, reviewed: { type: Boolean, default: false } });
exports.LoginSession = mk('LoginSession', { userId: ref('User'), loginTime: Date, logoutTime: Date, sessionStatus: { type: String, default: 'active' } });
