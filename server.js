'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, 'backups');
const DB_PATH = path.join(DATA_DIR, 'portal-viaticos.sqlite');
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));
const MAX_BODY = 20 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('capturador','master')),
    active INTEGER NOT NULL DEFAULT 1,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    status TEXT,
    jefe_approver_id TEXT,
    direccion_approver_id TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_viaticos_requester ON requests(requester_email);
  CREATE INDEX IF NOT EXISTS idx_viaticos_jefe ON requests(jefe_approver_id);
  CREATE INDEX IF NOT EXISTS idx_viaticos_direccion ON requests(direccion_approver_id);
  CREATE INDEX IF NOT EXISTS idx_viaticos_status ON requests(status);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

const DEFAULT_CONFIG = {
 companies:['Grupo Industrial Durandco','Blue Marine','BME Oil & Gas','BME Shipping II','BME Subtec','DBS','BMBS','Lichter Seguridad','Durandco Industrial'],
 positions:[
  {name:'Director Corporativo',group:'I'},{name:'Director Ejecutivo / Director de Área',group:'II'},
  {name:'Director Staff',group:'III'},{name:'Subdirector Ejecutivo / Subdirector de Área',group:'III'},
  {name:'Gerente Ejecutivo / Gerente de Área',group:'IV'},{name:'Jefe / Coordinador',group:'V'},
  {name:'Analista / Asistente / demás puestos',group:'V'}
 ],
 destinations:['CDMX','Ciudad del Carmen','Paraíso','Villahermosa'],
 requestTypes:['Viáticos anticipados','Tarjeta corporativa'],
 paymentMethods:['Transferencia electrónica','Tarjeta corporativa'],
 rates:{
  I:{food:4500,transport:1000,parking:700,hotel:3500},
  II:{food:3000,transport:800,parking:700,hotel:3000},
  III:{food:2500,transport:700,parking:500,hotel:1800},
  IV:{food:1500,transport:600,parking:500,hotel:1600},
  V:{food:950,transport:500,parking:500,hotel:1200}
 },
 approvalRules:{
  skipDirectionBelowLimit:true,
  directionThreshold:50000
 },
 questions:[
  {id:'onLeave',label:'¿Está de vacaciones, permiso o incapacidad?',default:'No',blockYes:true,message:'No se pueden otorgar viáticos durante vacaciones, permisos o incapacidad.',core:true},
  {id:'pendingProof',label:'¿Tiene comprobaciones pendientes?',default:'No',blockYes:true,message:'Debe cerrar la comprobación anterior antes de recibir nuevos recursos.',core:true},
  {id:'utilityVehicle',label:'¿Cuenta con vehículo utilitario?',default:'No',core:true},
  {id:'personalVehicle',label:'¿Usará automóvil particular?',default:'No',blockYes:true,message:'El uso de automóvil particular no está permitido.',core:true},
  {id:'requiresHotel',label:'¿Requiere hospedaje?',default:'Sí',core:true},
  {id:'budgeted',label:'¿El viaje está presupuestado?',default:'Sí',core:true},
  {id:'international',label:'¿Es un viaje al extranjero?',default:'No',core:true}
 ],
 flow:{jefeUserId:'JEFE',direccionUserId:'DIRECCION',requireComment:true},
 approverRoleProfiles:[
  {id:'AR_JEFE_DEFAULT',name:'Autorizador Jefe inmediato',type:'jefe',linkedUserId:'JEFE',description:'Perfil inicial de Jefe inmediato'},
  {id:'AR_DIRECCION_DEFAULT',name:'Autorizador Dirección',type:'direccion',linkedUserId:'DIRECCION',description:'Perfil inicial de Dirección'}
 ],
 approvalProfiles:[
  {id:'PROFILE_GENERAL',name:'Flujo general',description:'Ruta estándar de aprobación',jefeRoleProfileId:'AR_JEFE_DEFAULT',direccionRoleProfileId:'AR_DIRECCION_DEFAULT',jefeUserId:'JEFE',direccionUserId:'DIRECCION',requireComment:true}
 ]
};

const DEFAULT_USERS = [
  {
    id:'MASTER', email:'gls@durandco.com', password:'123456', name:'Génesis León Sarabia', role:'master',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:true, canApproveDireccion:true,
    jefeApproverId:'', direccionApproverId:'MASTER'
  },
  {
    id:'JEFE', email:'jefe.inmediato@empresa.com', password:'Jefe2026!', name:'Autorizador Jefe Inmediato', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Gerente Ejecutivo / Gerente de Área', baseCity:'CDMX', canApproveJefe:true, canApproveDireccion:false,
    jefeApproverId:'MASTER', direccionApproverId:'MASTER'
  },
  {
    id:'DIRECCION', email:'direccion@empresa.com', password:'Direccion2026!', name:'Autorizador Dirección', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:false, canApproveDireccion:true,
    jefeApproverId:'JEFE', direccionApproverId:'MASTER'
  },
  {
    id:'LUIS', email:'luis.mondragon@durandco.com', password:'Luis2026!', name:'Luis Mondragón', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:false, canApproveDireccion:true,
    jefeApproverId:'JEFE', direccionApproverId:'MASTER'
  }
];

function nowIso() { return new Date().toISOString(); }
function normalize(value) { return String(value || '').trim().toLocaleLowerCase('es-MX'); }
function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function cleanObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  const [kind, salt, expected] = String(encoded || '').split('$');
  if (kind !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function sanitizeUserPayload(payload, row = null) {
  const source = cleanObject(payload);
  const resolvedId = String(source.id || row?.id || '');
  const isMaster = resolvedId === 'MASTER' || row?.id === 'MASTER';
  const user = {
    ...source,
    id: resolvedId,
    email: normalize(source.email || row?.email || ''),
    name: String(source.name || row?.name || '').trim(),
    role: isMaster ? 'master' : 'capturador',
    company: String(source.company || ''),
    position: String(source.position || ''),
    baseCity: String(source.baseCity || ''),
    canApproveJefe: isMaster ? true : Boolean(source.canApproveJefe),
    canApproveDireccion: isMaster ? true : Boolean(source.canApproveDireccion),
    jefeApproverId: isMaster ? '' : String(source.jefeApproverId || ''),
    direccionApproverId: isMaster ? 'MASTER' : String(source.direccionApproverId || 'MASTER')
  };
  delete user.password;
  delete user.password_hash;
  return user;
}
function publicUser(row) {
  if (!row) return null;
  return sanitizeUserPayload(safeJsonParse(row.payload, {}), row);
}
function audit(userId, action, entityType, entityId = '', details = null) {
  db.prepare('INSERT INTO audit_log(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId || null, action, entityType, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, nowIso());
}
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? safeJsonParse(row.value, null) : null;
}
function setSetting(key, value, userId) {
  db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(key, JSON.stringify(value), nowIso(), userId || null);
}

function seed() {
  const insert = db.prepare(`INSERT OR IGNORE INTO users(id,email,password_hash,name,role,active,payload,created_at,updated_at)
    VALUES(?,?,?,?,?,1,?,?,?)`);
  const stamp = nowIso();
  for (const seedUser of DEFAULT_USERS) {
    const payload = sanitizeUserPayload(seedUser);
    insert.run(payload.id, payload.email, hashPassword(seedUser.password), payload.name, payload.role, JSON.stringify(payload), stamp, stamp);
  }
  if (!getSetting('config')) setSetting('config', DEFAULT_CONFIG, 'system');
}
seed();

function updateMasterIdentity() {
  const master = db.prepare('SELECT * FROM users WHERE id=?').get('MASTER');
  if (!master) return;
  const targetEmail = 'gls@durandco.com';
  const duplicate = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(targetEmail, 'MASTER');
  if (duplicate) {
    console.warn('No se actualizó el correo del usuario maestro porque ya existe otro usuario con gls@durandco.com.');
    return;
  }
  const payload = sanitizeUserPayload(safeJsonParse(master.payload, {}), master);
  payload.name = 'Génesis León Sarabia';
  payload.email = targetEmail;
  db.prepare('UPDATE users SET email=?,name=?,password_hash=?,payload=?,updated_at=? WHERE id=?')
    .run(targetEmail, payload.name, hashPassword('123456'), JSON.stringify(payload), nowIso(), 'MASTER');

  const config = getSetting('config');
  if (config && typeof config === 'object') {
    let changed = false;
    if (Array.isArray(config.approverRoleProfiles)) {
      config.approverRoleProfiles = config.approverRoleProfiles.map(profile => {
        if (profile?.linkedUserId === 'MASTER') {
          changed = true;
          return { ...profile, name: 'Génesis León Sarabia' };
        }
        return profile;
      });
    }
    if (Array.isArray(config.approvalProfiles)) {
      config.approvalProfiles = config.approvalProfiles.map(profile => {
        if (typeof profile?.description === 'string' && profile.description.includes('Giovanni aprueba')) {
          changed = true;
          return { ...profile, description: profile.description.replace('Giovanni aprueba', 'Génesis aprueba') };
        }
        return profile;
      });
    }
    if (changed) setSetting('config', config, 'system');
  }
}
updateMasterIdentity();

function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
function isSecureRequest(req) {
  return process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
}
function setSessionCookie(res, token, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `viaticos_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `viaticos_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
function getAuth(req) {
  const token = parseCookies(req).viaticos_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.token_hash,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND u.active=1`).get(hashToken(token));
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(nowIso(), row.token_hash);
  return publicUser(row);
}
function requireAuth(req, res) {
  const user = getAuth(req);
  if (!user) {
    json(res, 401, { error: 'Sesión no válida o vencida.' });
    return null;
  }
  return user;
}
function assertSameOrigin(req, res) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || (isSecureRequest(req) ? 'https' : 'http');
  if (origin !== `${protocol}://${host}`) {
    json(res, 403, { error: 'Origen no permitido.' });
    return false;
  }
  return true;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function json(res, status, payload) {
  securityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('El contenido supera el límite permitido.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON no válido.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function listUsers() {
  return db.prepare('SELECT * FROM users WHERE active=1 ORDER BY CASE WHEN id=\'MASTER\' THEN 0 ELSE 1 END, name').all().map(publicUser);
}
function requestRowToPayload(row) { return safeJsonParse(row.payload, {}); }
function listRequestsFor(user) {
  const rows = user.role === 'master'
    ? db.prepare('SELECT * FROM requests ORDER BY updated_at DESC').all()
    : db.prepare(`SELECT * FROM requests WHERE lower(requester_email)=? OR jefe_approver_id=? OR direccion_approver_id=? ORDER BY updated_at DESC`)
      .all(normalize(user.email), user.id, user.id);
  return rows.map(requestRowToPayload);
}
function normalizeRequest(input) {
  const request = clone(cleanObject(input));
  request.id = String(request.id || '').trim();
  request.requesterEmail = normalize(request.requesterEmail);
  request.status = String(request.status || 'Pendiente Aprobación Jefe');
  request.jefeApproverId = String(request.jefeApproverId || '');
  request.direccionApproverId = String(request.direccionApproverId || (normalize(request.requestType)==='tarjeta corporativa' ? 'LUIS' : 'MASTER'));
  request.requiresDirection = true;
  request.skipDirectionBelowLimit = false;
  if (!Array.isArray(request.history)) request.history = [];
  return request;
}
function upsertRequest(request, userId) {
  db.prepare(`INSERT INTO requests(id,payload,requester_email,status,jefe_approver_id,direccion_approver_id,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,requester_email=excluded.requester_email,status=excluded.status,
      jefe_approver_id=excluded.jefe_approver_id,direccion_approver_id=excluded.direccion_approver_id,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(request.id, JSON.stringify(request), request.requesterEmail, request.status, request.jefeApproverId, request.direccionApproverId, nowIso(), userId);
}
function mergeApproverUpdate(oldRequest, incoming) {
  const next = clone(oldRequest);
  const fields = ['status','jefeComment','jefeSignedBy','jefeSignedAt','direccionComment','resourceReadyAt','cardAuthorizedAt','giovanniNotifiedAt','history'];
  for (const field of fields) if (Object.hasOwn(incoming, field)) next[field] = clone(incoming[field]);
  next.jefeApproverId = oldRequest.jefeApproverId;
  next.direccionApproverId = oldRequest.direccionApproverId;
  next.requesterEmail = oldRequest.requesterEmail;
  next.requester = oldRequest.requester;
  return normalizeRequest(next);
}
function mergeOwnerUpdate(oldRequest, incoming) {
  const next = clone(incoming);
  const protectedFields = ['status','jefeApproverId','direccionApproverId','jefeComment','jefeSignedBy','jefeSignedAt','direccionComment','resourceReadyAt','cardAuthorizedAt','giovanniNotifiedAt'];
  for (const field of protectedFields) next[field] = clone(oldRequest[field]);
  next.requesterEmail = oldRequest.requesterEmail;
  next.requester = oldRequest.requester;
  return normalizeRequest(next);
}
function canUpdateRequest(user, oldRequest, incoming) {
  if (user.role === 'master') return { allowed: true, mode: 'master' };
  if (!oldRequest) return normalize(incoming.requesterEmail) === normalize(user.email)
    ? { allowed: true, mode: 'new-owner' }
    : { allowed: false };
  if (normalize(oldRequest.requesterEmail) === normalize(user.email)) return { allowed: true, mode: 'owner' };
  if (oldRequest.jefeApproverId === user.id && oldRequest.status === 'Pendiente Aprobación Jefe' && user.canApproveJefe) {
    return { allowed: true, mode: 'approver' };
  }
  if (oldRequest.direccionApproverId === user.id &&
      ['Pendiente Genesis Leon','Pendiente Luis Mondragón'].includes(String(oldRequest.status || '')) &&
      user.canApproveDireccion) {
    return { allowed: true, mode: 'approver' };
  }
  return { allowed: false };
}

async function syncUsers(user, incomingUsers) {
  if (user.role !== 'master') throw Object.assign(new Error('Sólo el usuario maestro puede administrar usuarios.'), { statusCode: 403 });
  if (!Array.isArray(incomingUsers)) throw Object.assign(new Error('La lista de usuarios no es válida.'), { statusCode: 400 });
  const existingRows = db.prepare('SELECT * FROM users').all();
  const existingById = new Map(existingRows.map(row => [row.id, row]));
  const seen = new Set();
  const stamp = nowIso();
  db.exec('BEGIN');
  try {
    for (const raw of incomingUsers) {
      const source = cleanObject(raw);
      const id = String(source.id || '').trim();
      if (!id || !source.name || !source.email) throw Object.assign(new Error('Cada usuario requiere ID, nombre y correo.'), { statusCode: 400 });
      const existing = existingById.get(id);
      const payload = sanitizeUserPayload(source, existing);
      if (id === 'MASTER') {
        payload.id = 'MASTER'; payload.role = 'master'; payload.canApproveJefe = true; payload.canApproveDireccion = true; payload.direccionApproverId = 'MASTER';
      }
      const duplicate = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(payload.email, id);
      if (duplicate) throw Object.assign(new Error(`El correo ${payload.email} ya pertenece a otro usuario.`), { statusCode: 409 });
      let passwordHash = existing?.password_hash;
      const suppliedPassword = typeof source.password === 'string' ? source.password : '';
      if (!existing && suppliedPassword.length < 6) throw Object.assign(new Error(`Define una contraseña inicial de al menos 6 caracteres para ${payload.name}.`), { statusCode: 400 });
      if (suppliedPassword) {
        if (suppliedPassword.length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres.'), { statusCode: 400 });
        passwordHash = hashPassword(suppliedPassword);
      }
      db.prepare(`INSERT INTO users(id,email,password_hash,name,role,active,payload,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)
        ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,name=excluded.name,role=excluded.role,
          active=1,payload=excluded.payload,updated_at=excluded.updated_at`)
        .run(id, payload.email, passwordHash, payload.name, payload.role, JSON.stringify(payload), existing?.created_at || stamp, stamp);
      seen.add(id);
    }
    for (const row of existingRows) {
      if (!['MASTER','LUIS'].includes(row.id) && !seen.has(row.id)) db.prepare('UPDATE users SET active=0,updated_at=? WHERE id=?').run(stamp, row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit(user.id, 'sync', 'users', '', { count: incomingUsers.length });
}

async function syncRequests(user, incomingRequests) {
  if (!Array.isArray(incomingRequests)) throw Object.assign(new Error('La lista de solicitudes no es válida.'), { statusCode: 400 });
  const normalized = incomingRequests.map(normalizeRequest).filter(request => request.id);
  const incomingIds = new Set(normalized.map(request => request.id));
  const allRows = db.prepare('SELECT * FROM requests').all();
  const byId = new Map(allRows.map(row => [row.id, requestRowToPayload(row)]));

  db.exec('BEGIN');
  try {
    for (const incoming of normalized) {
      const oldRequest = byId.get(incoming.id) || null;
      const permission = canUpdateRequest(user, oldRequest, incoming);
      if (!permission.allowed) continue;
      let next = incoming;
      if (permission.mode === 'approver') next = mergeApproverUpdate(oldRequest, incoming);
      if (permission.mode === 'owner') next = mergeOwnerUpdate(oldRequest, incoming);
      if (permission.mode === 'new-owner') {
        const userRow = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
        const profile = publicUser(userRow);
        if (!profile?.jefeApproverId) throw Object.assign(new Error('Tu usuario todavía no tiene asignado un Jefe inmediato para firma.'), { statusCode: 400 });
        next.requesterEmail = normalize(user.email);
        next.requester = user.name;
        next.jefeApproverId = profile.jefeApproverId;
        next.status = 'Pendiente Aprobación Jefe';
        next.direccionApproverId = String(incoming.direccionApproverId || (normalize(incoming.requestType)==='tarjeta corporativa' ? 'LUIS' : 'MASTER'));
      }
      upsertRequest(normalizeRequest(next), user.id);
    }
    if (user.role === 'master') {
      for (const row of allRows) {
        if (!incomingIds.has(row.id)) db.prepare('DELETE FROM requests WHERE id=?').run(row.id);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit(user.id, 'sync', 'requests', '', { count: normalized.length });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
    '.ico':'image/x-icon', '.webp':'image/webp', '.csv':'text/csv; charset=utf-8'
  })[ext] || 'application/octet-stream';
}
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Ruta no permitida.' });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) filePath = path.join(PUBLIC_DIR, 'index.html');
  securityHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType(filePath));
  res.setHeader('Cache-Control', path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname) {
  if (!assertSameOrigin(req, res)) return;
  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'portal-viaticos-durandco', time: nowIso() });

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const email = normalize(body.email);
    const row = db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(email);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      audit(row?.id || null, 'login_failed', 'session', '', { email });
      return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const stamp = nowIso();
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(stamp);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(hashToken(token), row.id, expires, stamp, stamp);
    setSessionCookie(res, token, req);
    audit(row.id, 'login', 'session');
    return json(res, 200, { user: publicUser(row) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req).viaticos_session;
    const user = getAuth(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    clearSessionCookie(res, req);
    if (user) audit(user.id, 'logout', 'session');
    return json(res, 200, { ok: true });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET' && pathname === '/api/me') return json(res, 200, { user });

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    return json(res, 200, {
      user,
      users: listUsers(),
      config: getSetting('config') || DEFAULT_CONFIG,
      requests: listRequestsFor(user),
      serverTime: nowIso()
    });
  }

  if (req.method === 'PUT' && pathname === '/api/state/config') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede modificar la configuración.' });
    const body = await readJson(req);
    setSetting('config', cleanObject(body.value), user.id);
    audit(user.id, 'update', 'config');
    return json(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
    if (!row) return json(res, 404, { error: 'Usuario no encontrado.' });
    const current = publicUser(row);
    const source = cleanObject(body.profile);
    const next = sanitizeUserPayload({
      ...current,
      company: String(source.company || current.company || ''),
      position: String(source.position || current.position || ''),
      baseCity: String(source.baseCity || current.baseCity || '')
    }, row);
    db.prepare('UPDATE users SET payload=?,updated_at=? WHERE id=?').run(JSON.stringify(next), nowIso(), user.id);
    audit(user.id, 'update', 'profile', user.id, { company: next.company, position: next.position, baseCity: next.baseCity });
    return json(res, 200, { ok: true, user: next });
  }

  if (req.method === 'PUT' && pathname === '/api/state/users') {
    const body = await readJson(req);
    await syncUsers(user, body.users);
    return json(res, 200, { ok: true, users: listUsers() });
  }

  if (req.method === 'PUT' && pathname === '/api/requests/sync') {
    const body = await readJson(req);
    await syncRequests(user, body.requests);
    return json(res, 200, { ok: true, requests: listRequestsFor(user) });
  }

  if (req.method === 'POST' && pathname === '/api/change-password') {
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
    const nextPassword = String(body.newPassword || '');
    if (nextPassword.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nextPassword) || !/\d/.test(nextPassword)) {
      return json(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres, letras y números.' });
    }
    db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(nextPassword), nowIso(), user.id);
    audit(user.id, 'change_password', 'user', user.id);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/migrate') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede migrar datos.' });
    const body = await readJson(req);
    if (body.config) setSetting('config', cleanObject(body.config), user.id);
    if (Array.isArray(body.users)) await syncUsers(user, body.users);
    if (Array.isArray(body.requests)) await syncRequests(user, body.requests);
    audit(user.id, 'migrate', 'application', '', { requests: body.requests?.length || 0, users: body.users?.length || 0 });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/admin/backup') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede descargar respaldos.' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `portal-viaticos-${stamp}.sqlite`;
    const destination = path.join(BACKUP_DIR, filename);
    await backup(db, destination);
    audit(user.id, 'backup', 'database', filename);
    securityHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fs.statSync(destination).size);
    return fs.createReadStream(destination).pipe(res);
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit') {
    if (user.role !== 'master') return json(res, 403, { error: 'Acceso restringido.' });
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').all().map(row => ({ ...row, details: safeJsonParse(row.details, null) }));
    return json(res, 200, { audit: rows });
  }

  return json(res, 404, { error: 'Ruta no encontrada.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.message || 'Error interno del servidor.' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Portal de Viáticos activo en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});
