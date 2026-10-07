const jwt = require('jsonwebtoken'), { LoginSession } = require('./models');
/* Verifies JWT AND that its login session is still active (so logout really invalidates the token). */
exports.auth = async (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    const ls = await LoginSession.findOne({ _id: p.lsid, sessionStatus: 'active' });
    if (!ls) return res.status(401).json({ message: 'Session ended' });
    req.user = { id: p.id, role: p.role, lsid: p.lsid, name: p.name, studentId: p.studentId, year: p.year, department: p.department, division: p.division };
    next();
  } catch { res.status(401).json({ message: 'Not authenticated' }); }
};
exports.role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ message: 'Forbidden' });
