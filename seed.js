require('dotenv').config(); const bcrypt = require('bcryptjs'), mongoose = require('mongoose'), { User } = require('./models');
(async () => {
  await mongoose.connect(process.env.MONGO_URI); await User.deleteMany({});
  const mk = async (name, email, pw, role, studentId) => User.create({ name, email, passwordHash: await bcrypt.hash(pw, 12), role, studentId, department: 'CSE', year: 'SY', division: 'A' });
  await mk('Rahul Patil', 'rahul@college.edu', 'student123', 'student', '101'); await mk('Amit Kumar', 'amit@college.edu', 'student123', 'student', '102');
  await mk('Sneha Joshi', 'sneha@college.edu', 'student123', 'student', '103'); await mk('Prof. Sharma', 'sharma@college.edu', 'faculty123', 'faculty');
  await mk('System Administrator', 'admin@college.edu', 'admin123', 'admin'); console.log('Seeded demo users'); process.exit(0);
})();
