require('dotenv').config();
const express = require('express'), mongoose = require('mongoose'), helmet = require('helmet'), cors = require('cors'),
  rate = require('express-rate-limit'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const M = require('./models'), { auth, role } = require('./auth');
const app = express(), isId = x => mongoose.isValidObjectId(x), SESSION_MS = 45000;
app.use(helmet(), cors({ origin: process.env.CLIENT_ORIGIN }), express.json({ limit: '10kb' }));
app.use('/api/auth', rate({ windowMs: 15 * 60e3, max: 30 }));          // brute-force protection
app.use('/api/attendance/scan', rate({ windowMs: 60e3, max: 20 }));    // scan flooding
const r = express.Router(); app.use('/api', r);
const wrap = f => (q, s, n) => f(q, s, n).catch(e => { console.error(e); s.status(500).json({ message: 'Server error' }); });
const str = (v, min = 1, max = 100) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

/* ---------- Auth ---------- */
r.post('/auth/signup', wrap(async (q, s) => {
  const { name, email, password, role: ro, studentId, department, year, division } = q.body;
  if (!str(name, 3) || !/^\S+@\S+\.\S+$/.test(email || '') || !str(password, 8) || !/\d/.test(password) || !['student', 'faculty'].includes(ro))
    return s.status(400).json({ message: 'Invalid input' });                 // admins can never self-register
  if (ro === 'student' && !str(studentId, 2, 12)) return s.status(400).json({ message: 'Roll number required' });
  try {
    await M.User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: ro, department, year, division,
      studentId: ro === 'student' ? studentId : undefined });
    s.status(201).json({ ok: true });
  } catch (e) { s.status(e.code === 11000 ? 409 : 500).json({ message: 'Email or roll number already registered' }); }
}));
r.post('/auth/login', wrap(async (q, s) => {
  const { id, password, role: ro } = q.body;
  const u = await M.User.findOne({ $or: [{ email: String(id).toLowerCase() }, { studentId: String(id) }], role: ro });
  if (!u || u.status !== 'Active' || !(await bcrypt.compare(String(password), u.passwordHash))) return s.status(401).json({ message: 'Invalid credentials' });
  const ls = await M.LoginSession.create({ userId: u._id, loginTime: new Date() });
  const token = jwt.sign({ id: u.id, lsid: ls.id, role: u.role, name: u.name, studentId: u.studentId, year: u.year, department: u.department, division: u.division },
    process.env.JWT_SECRET, { expiresIn: '8h' });
  s.json({ token, user: { name: u.name, role: u.role, studentId: u.studentId } });
}));
r.post('/auth/logout', auth, wrap(async (q, s) => {
  await M.LoginSession.updateOne({ _id: q.user.lsid }, { sessionStatus: 'closed', logoutTime: new Date() }); s.json({ ok: true });
}));

/* ---------- QR sessions (faculty) ---------- */
const newToken = async ses => {                       // 7-9s life, never beyond session end
  const life = 7000 + Math.floor(Math.random() * 2001);
  return M.QrToken.create({ sessionId: ses._id, token: crypto.randomBytes(16).toString('hex'), expiresAt: new Date(Math.min(Date.now() + life, +ses.endTime)) });
};
r.post('/sessions', auth, role('faculty'), wrap(async (q, s) => {
  const { subject, className, division } = q.body;
  if (!str(subject) || !str(className)) return s.status(400).json({ message: 'Invalid input' });
  const now = Date.now(), ses = await M.Session.create({ subject, facultyId: q.user.id, className, division, startTime: new Date(now), endTime: new Date(now + SESSION_MS) });
  s.status(201).json({ sessionId: ses.id, endsAt: ses.endTime });
}));
/* Faculty screen polls this; server rotates the token when the current one has expired. */
r.get('/sessions/:id/qr', auth, role('faculty'), wrap(async (q, s) => {
  const ses = isId(q.params.id) && await M.Session.findOne({ _id: q.params.id, facultyId: q.user.id });
  if (!ses) return s.status(404).json({ message: 'Not found' });
  if (Date.now() >= +ses.endTime) { ses.status = 'expired'; await ses.save(); return s.json({ expired: true }); }
  let t = await M.QrToken.findOne({ sessionId: ses._id }).sort({ expiresAt: -1 });
  if (!t || Date.now() >= +t.expiresAt) t = await newToken(ses);
  s.json({ payload: JSON.stringify({ s: ses.id, t: t.token }), tokenExpiresAt: t.expiresAt, secondsLeft: Math.ceil((ses.endTime - Date.now()) / 1000) });
}));

/* ---------- Student scan: the BACKEND decides validity ---------- */
r.post('/attendance/scan', auth, role('student'), wrap(async (q, s) => {
  const { sessionId, token } = q.body, u = q.user;
  const ev = (eventType, riskLevel, details) => M.SecurityEvent.create({ studentId: u.id, sessionId: isId(sessionId) ? sessionId : undefined, eventType, riskLevel, details });
  const fail = async (code, type, risk, msg) => { await ev(type, risk, msg); return s.status(code).json({ ok: false, message: msg }); };
  if (!isId(sessionId) || !str(token, 8, 64)) return fail(400, 'Malformed QR', 'Medium', 'Invalid QR');
  const ses = await M.Session.findById(sessionId);
  if (!ses || ses.status !== 'active' || Date.now() >= +ses.endTime) return fail(410, 'Expired QR', 'Medium', 'QR Expired. Please scan the latest QR displayed by your faculty.');
  const t = await M.QrToken.findOne({ sessionId, token });
  if (!t) return fail(401, 'Invalid token', 'High', 'QR Invalid.');
  if (Date.now() >= +t.expiresAt) return fail(410, 'Expired QR (possibly shared)', 'Medium', 'QR Expired. Please scan the latest QR displayed by your faculty.');
  if (ses.className !== `${u.year}-${u.department}`) return fail(403, 'Wrong class', 'Low', 'This session is for a different class.');
  try {
    const a = await M.Attendance.create({ studentId: u.id, sessionId, subject: ses.subject, date: new Date(), status: 'Present', method: 'QR', verificationStatus: 'Verified' });
    s.json({ ok: true, attendance: a });
  } catch (e) { if (e.code === 11000) return s.status(409).json({ ok: false, message: 'Already marked' }); throw e; }
}));

/* ---------- Attendance / manual / history ---------- */
r.post('/attendance/manual', auth, role('faculty'), wrap(async (q, s) => {
  const { subject, records } = q.body;                        // [{studentId, status}]
  if (!str(subject) || !Array.isArray(records) || records.some(x => !isId(x.studentId) || !['Present', 'Absent', 'Late'].includes(x.status))) return s.status(400).json({ message: 'Invalid input' });
  await M.Attendance.insertMany(records.map(x => ({ ...x, subject, date: new Date(), method: 'Manual', verificationStatus: 'Faculty', changedBy: q.user.id })));
  s.json({ ok: true });
}));
r.get('/attendance', auth, wrap(async (q, s) => {
  const f = {}; if (q.user.role === 'student') f.studentId = q.user.id;         // students only see their own rows
  if (q.query.subject) f.subject = String(q.query.subject); if (q.query.method) f.method = String(q.query.method);
  s.json(await M.Attendance.find(f).populate('studentId', 'name studentId').sort({ date: -1 }).limit(500));
}));

/* ---------- Security + admin ---------- */
r.get('/security', auth, role('faculty', 'admin'), wrap(async (q, s) => s.json(await M.SecurityEvent.find().populate('studentId', 'name').sort({ createdAt: -1 }).limit(200))));
r.patch('/security/:id/review', auth, role('faculty', 'admin'), wrap(async (q, s) => { if (!isId(q.params.id)) return s.sendStatus(400); await M.SecurityEvent.updateOne({ _id: q.params.id }, { reviewed: true }); s.json({ ok: true }); }));
r.get('/users', auth, role('admin'), wrap(async (q, s) => s.json(await M.User.find().select('-passwordHash'))));
r.patch('/users/:id/status', auth, role('admin'), wrap(async (q, s) => { if (!isId(q.params.id) || !['Active', 'Inactive'].includes(q.body.status)) return s.sendStatus(400); await M.User.updateOne({ _id: q.params.id }, { status: q.body.status }); s.json({ ok: true }); }));
r.get('/users/:id/logins', auth, role('admin'), wrap(async (q, s) => s.json(await M.LoginSession.find({ userId: q.params.id }).sort({ loginTime: -1 }).limit(50))));

mongoose.connect(process.env.MONGO_URI).then(() => app.listen(process.env.PORT || 5000, () => console.log('SmartAttend API running')));
