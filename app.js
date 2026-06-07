const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const jwt = require('jsonwebtoken');

const app = express();
const db = new sqlite3.Database('./users.db');
const JWT_SECRET = 'your-secret-key'; // Use a strong secret in production

// Corporate network gateway — admin logins must originate from here.
const CORP_GATEWAY_IP = '10.13.37.42';
// Log directory served by the diagnostics log reader.
const LOG_DIR = path.join(__dirname, 'logs');


let doorbellMessage = 'Umm, hello? Can you kindly get the **** off the line? That would be suuuuper, thx?';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'HavenAuth/1.8.3');
  res.setHeader('X-Debug-Mode', 'verbose; legacy-jwt=enabled; log-reader=/api/logs');
  next();
});

// dotfiles:'allow' so /.well-known/security.txt is reachable
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

// Initialize DB and provision baseline accounts if not present
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )`);
  // Demo analyst account for routine access
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('analyst', 'analyst123', 'user')`);
  // Service backup account provisioned by ops (credential stored encoded — see internal runbook)
  const SVC_USER = 'svc_backup';
  const SVC_PW = Buffer.from('U3VtbWVyMjAyMyFNYXBsZQ==', 'base64').toString('utf8');
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, 'admin')`, [SVC_USER, SVC_PW]);
});

// Middleware to check JWT.
// HavenAuth legacy compatibility: the algorithm declared in the token header is honored.
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Malformed Authorization header' });

  let header;
  try {
    header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
  } catch (e) {
    return res.status(403).json({ error: 'Invalid token header' });
  }

  // Legacy unsigned-token path (kept for backward compatibility with old mobile clients)
  if (header.alg && header.alg.toLowerCase() === 'none') {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
      req.user = payload;
      req.user.viaNone = true;
      return next();
    } catch (e) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));

// Console route (admin UI shell — access is gated client-side only)
app.get('/console', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Echo the caller's IP so the client can attach it to login requests
app.get('/api/whoami', (req, res) => {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  res.json({ ip: xff || req.socket.remoteAddress });
});

// Diagnostics log reader — restricted to the log directory
app.get('/api/logs', (req, res) => {
  const requested = req.query.file || path.join(LOG_DIR, 'app.log');
  // Security: only allow files inside the log directory
  if (!requested.startsWith(LOG_DIR)) {
    return res.status(403).json({
      error: 'Access denied',
      detail: `file must be located within ${LOG_DIR}`
    });
  }
  fs.readFile(requested, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'Log file not found', detail: err.message });
    res.type('text/plain').send(data);
  });
});

// Console secret endpoint (broken property/object-level authorization)
app.get('/api/console/token', authenticateJWT, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const referer = req.get('Referer');
  if (!referer || !referer.endsWith('/console')) {
    return res.status(403).json({ error: 'Invalid access' });
  }
  res.json({ flag: 'WEB{0bj3ct_pr0p3rty_l3v3l_4uth}' });
});

// Account directory (admin only)
app.get('/api/directory', authenticateJWT, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  db.all('SELECT username, role FROM users', (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ message: 'Account directory', users });
  });
});

// PUT request has no authentication (broken function-level authorization)
app.put('/api/directory', (req, res) => {
  db.all('SELECT username, role FROM users', (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({
      message: 'Account directory (PUT method)',
      flag: 'WEB{put_m3th0d_d1r3ct0ry_byp4ss}',
      users,
      admin_functions: {
        create_user: '/api/directory/create',
        delete_user: '/api/directory/delete',
        reset_password: '/api/directory/reset'
      }
    });
  });
});

// Unauthenticated diagnostics endpoint
app.get('/debug/status', (req, res) => {
  const status = {
    server: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      env: process.env.NODE_ENV || 'development'
    },
    process: {
      pid: process.pid,
      ppid: process.ppid,
      cwd: process.cwd(),
      uid: process.getuid && process.getuid(),
      gid: process.getgid && process.getgid()
    },
    app: {
      framework: 'HavenAuth v1.8.3',
      log_dir: LOG_DIR,
      database: {
        type: 'sqlite3',
        path: './users.db',
        size: fs.statSync('./users.db').size + ' bytes'
      },
      corporate_gateway: CORP_GATEWAY_IP,
      start_time: new Date(Date.now() - process.uptime() * 1000).toISOString()
    },
    flag: 'WEB{d3bug_st4tus_l3ft_w1d3_0p3n}'
  };
  res.json(status);
});

// Handle login (expects JSON)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ status: 500, error: 'Database error.' });
    if (!user || user.password !== password) {
      return res.status(401).json({ status: 401, error: 'Invalid username or password.' });
    }

    // Administrator logins are restricted to the corporate network.
    if (user.role === 'admin') {
      const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xff !== CORP_GATEWAY_IP) {
        return res.status(403).json({
          status: 403,
          error: `Administrator logins are restricted to the corporate network (10.13.37.0/24). Request originated from '${xff || req.socket.remoteAddress}'.`
        });
      }
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h', issuer: 'HavenAuth' }
    );
    res.json({ token, status: 200 });
  });
});

// Handle registration (expects JSON) — trusts client-supplied role (mass assignment)
app.post('/signup', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  let userRole = (role === 'admin') ? 'admin' : 'user';
  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, password, userRole],
    function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ error: 'Username already exists.' });
        }
        return res.status(500).json({ error: 'Database error.' });
      }
      res.json({ success: true });
    }
  );
});

// Protected API: current user info and all users
app.get('/api/portal', authenticateJWT, (req, res) => {
  db.all('SELECT username, role FROM users', (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    const responseData = { user: req.user, users };

    if (req.user.role === 'admin') {
      responseData.propertyFlag = 'WEB{0bj3ct_pr0p3rty_l3v3l_4uth}';
      // Reward for an unsigned (alg:none) token reaching an admin context
      if (req.user.viaNone) {
        responseData.algNoneFlag = 'WEB{n0n3_4lg0r1thm_4cc3pt3d}';
      }
    }

    res.json(responseData);
  });
});

// Doorbell note — any signed-in patron can leave the greeting for the next
// person at the counter. Stored exactly as supplied (injection point).
app.post('/api/doorbell', authenticateJWT, (req, res) => {
  const { message } = req.body;
  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  doorbellMessage = message;
  res.json({ status: 200 });
});

// The portal reads this on load and drops it into the pop-up. Staff (admins)
// also get the back-of-house note pinned by the door.
app.get('/api/doorbell', authenticateJWT, (req, res) => {
  const responseData = { message: doorbellMessage };
  if (req.user.role === 'admin') {
    responseData.flag = 'WEB{st0r3d_xss_thr0ugh_th3_d00rb3ll}';
  }
  res.json(responseData);
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
