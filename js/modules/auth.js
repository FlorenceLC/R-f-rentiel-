/**
 * Auth module — session management, password verification.
 * Uses localStorage for session persistence within the tab.
 * Passwords are stored as __PLAIN__<pwd> for the default admin
 * or as SHA-256 hex for user-created passwords.
 */
import { queryOne, run, saveDB, getSetting } from './db.js';

const SESSION_KEY = 'rcu_session';
const TIMEOUT_MS  = 3600 * 1000; // 1h

// ── Password ──────────────────────────────────────────────

export async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return '__SHA256__' + Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function verifyPassword(password, stored) {
  if (stored.startsWith('__PLAIN__')) return password === stored.slice(9);
  if (stored.startsWith('__SHA256__')) {
    const h = await hashPassword(password);
    return h === stored;
  }
  return false;
}

// ── Login ─────────────────────────────────────────────────

export async function loginAdmin(username, password) {
  if (!username || !password) return { ok: false, msg: 'Identifiant et mot de passe requis.' };

  const user = queryOne(
    `SELECT * FROM users WHERE username=? AND actif=1`,
    [username.trim()]
  );
  if (!user) return { ok: false, msg: 'Identifiant ou mot de passe incorrect.' };

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { ok: false, msg: 'Identifiant ou mot de passe incorrect.' };

  // Update last login
  run(`UPDATE users SET derniere_connexion=datetime('now') WHERE id=?`, [user.id]);
  await saveDB();

  const session = { profile: 'admin', user, login_time: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, user };
}

export function loginVisitor() {
  const session = { profile: 'visitor', user: null, login_time: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Session getters ───────────────────────────────────────

function _getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function isLoggedIn() {
  return !!_getSession();
}

export function isAdmin() {
  const s = _getSession();
  if (!s || s.profile !== 'admin') return false;
  const timeout = parseInt(getSetting('admin_session_timeout', '3600')) * 1000;
  if (Date.now() - s.login_time > timeout) { logout(); return false; }
  return true;
}

export function isVisitor() {
  const s = _getSession();
  return s?.profile === 'visitor';
}

export function getCurrentUser() {
  const s = _getSession();
  return s?.user || null;
}

export function getCurrentUsername() {
  const u = getCurrentUser();
  if (u) return `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username;
  return 'Visiteur';
}

export function getUserRole() {
  return getCurrentUser()?.role || null;
}

/** Return 'FR', 'DE', or null for the current user's country */
export function getUserPays() {
  // Re-read from DB to pick up any changes made after login
  const user = getCurrentUser();
  if (!user) return null;
  // The session stores the user object at login time; pays may have been added later
  // so we return what's in the session (refreshed on next login)
  return user.pays || null;
}

export function canAccessGlobalAdmin() {
  return getUserRole() === 'ADMIN_GLOBAL';
}

// ── User CRUD ─────────────────────────────────────────────

export function listUsers() {
  return queryOne
    ? require('./db.js').query(
        `SELECT id,username,prenom,nom,email,role,type_sujet,actif,date_creation,derniere_connexion FROM users ORDER BY nom,prenom`
      )
    : [];
}

export async function createUser({ username, password, prenom, nom, email, role, type_sujet = null }) {
  const { queryOne: q, run: r, saveDB: s, query } = await import('./db.js');
  const existing = q(`SELECT id FROM users WHERE username=? OR email=?`, [username, email]);
  if (existing) return { ok: false, msg: 'Cet identifiant ou email est déjà utilisé.' };
  const ph = await hashPassword(password);
  r(`INSERT INTO users(username,password_hash,prenom,nom,email,role,type_sujet,actif)
     VALUES(?,?,?,?,?,?,?,1)`, [username, ph, prenom, nom, email, role, type_sujet]);
  await s();
  return { ok: true };
}

export async function changePassword(userId, newPassword) {
  const { run: r, saveDB: s } = await import('./db.js');
  const ph = await hashPassword(newPassword);
  r(`UPDATE users SET password_hash=?,date_modification=datetime('now') WHERE id=?`, [ph, userId]);
  await s();
  return { ok: true };
}
