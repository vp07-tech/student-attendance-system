# SmartAttend – Smart Attendance & Anti-Proxy System

## Structure
```
frontend/            static app (open index.html or serve the folder)
  index.html
  css/style.css
  js/api.js          mock API + database layer (localStorage)  <-- replace with fetch() calls to /backend
  js/app.js          UI, routing, role-based views
backend/             Node + Express + MongoDB API
  src/server.js      routes, QR rotation + scan validation, rate limiting
  src/models.js      Users, Subjects, Sessions, QrTokens, Attendance, SecurityEvents, LoginSessions
  src/auth.js        JWT + active-login-session check, role middleware
  src/seed.js        demo users
```
## Run the frontend (works standalone with mock data)
`cd frontend && npx serve .`  (camera scanning needs HTTPS or localhost)

Demo: rahul@college.edu / student123 · sharma@college.edu / faculty123 · admin@college.edu / admin123

## Run the backend
```
cd backend && npm install && cp .env.example .env   # set JWT_SECRET
npm run seed && npm start
```
Endpoints: POST /api/auth/{signup,login,logout} · POST /api/sessions · GET /api/sessions/:id/qr · POST /api/attendance/scan ·
POST /api/attendance/manual · GET /api/attendance · GET /api/security · PATCH /api/security/:id/review · GET /api/users · PATCH /api/users/:id/status

## Status
The backend is complete but not yet wired to the frontend: the frontend still uses `js/api.js` (localStorage).
Connecting means replacing the `API` methods with fetch() calls (send `Authorization: Bearer <token>`).
Security logic to keep server-side: token validation, expiry, duplicate check (also enforced by a unique DB index), class check, security-event logging.
