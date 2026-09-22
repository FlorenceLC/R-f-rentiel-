/**
 * Main app — router, sidebar, boot sequence
 */
import { initDB, getSetting, query, queryOne } from './modules/db.js';
import { isLoggedIn, isAdmin, isVisitor, getCurrentUser, getCurrentUsername, getUserPays, logout, loginVisitor, loginAdmin } from './modules/auth.js';
import { el, setHTML, toast, closeModal } from './modules/ui.js';
import { setLang, getLang, t } from './modules/i18n.js';

// ── Page imports ──────────────────────────────────────────
import { renderAccueil }         from './pages/accueil.js';
import { renderCatalogue }       from './pages/catalogue.js';
import { renderDemande }         from './pages/demande.js';
import { renderApplications }    from './pages/applications.js';
import { renderAssistant }       from './pages/assistant.js';
import { renderGuide, renderFAQ } from './pages/guide.js';
import { renderSpecial }          from './pages/special.js';
import { renderAdminDemandes }   from './admin/demandes.js';
import { renderAdminCatalogue }  from './admin/catalogue.js';
import { renderAdminReferentiels } from './admin/referentiels.js';
import { renderAdminUsers }      from './admin/utilisateurs.js';
import { renderAdminParamsIA }   from './admin/params_ia.js';
import { renderAdminParams }     from './admin/params.js';
import { renderAdminArchives }   from './admin/archives.js';

// ── State ─────────────────────────────────────────────────
let _currentPage = 'accueil';
let _pageParams  = {};

// ── Page registry ─────────────────────────────────────────
const PAGES = {
  accueil:             { fn: renderAccueil,          label: '🏠 Accueil',         admin: false },
  catalogue:           { fn: renderCatalogue,         label: '📚 Catalogue',        admin: false },
  applications:        { fn: renderApplications,      label: '🚀 Applications',     admin: false },
  demande:             { fn: renderDemande,           label: '📝 Soumettre un besoin', admin: false },
  assistant:           { fn: renderAssistant,         label: '🤖 Assistant IA',     admin: false },
  guide:               { fn: renderGuide,             label: '📖 Guide',            admin: false },
  faq:                 { fn: renderFAQ,               label: '❓ FAQ',               admin: false },
  special:             { fn: renderSpecial,           label: '🌍 Spécial',           admin: false },
  admin_demandes:      { fn: renderAdminDemandes,     label: '🔔 Demandes',         admin: true  },
  admin_catalogue:     { fn: renderAdminCatalogue,    label: '🗂️ Catalogue',         admin: true  },
  admin_archives:      { fn: renderAdminArchives,     label: '📦 Archives',         admin: true  },
  admin_referentiels:  { fn: renderAdminReferentiels, label: '🔧 Référentiels',     admin: true  },
  admin_utilisateurs:  { fn: renderAdminUsers,        label: '👥 Utilisateurs',     admin: true  },
  admin_params_ia:     { fn: renderAdminParamsIA,     label: '🤖 Paramètres IA',    admin: true  },
  admin_params:        { fn: renderAdminParams,       label: '⚙️ Paramètres',        admin: true  },
};

// ── Router ────────────────────────────────────────────────

export function navigate(page, params = {}) {
  if (PAGES[page]?.admin && !isAdmin()) {
    toast('Accès réservé aux administrateurs.', 'danger');
    return;
  }
  _currentPage = page;
  _pageParams  = params;
  _render();
}

export function getPageParams() { return _pageParams; }
export function setPageParam(key, val) { _pageParams[key] = val; }

function _render() {
  const app = el('app');
  if (!app) return;

  if (!isLoggedIn()) {
    app.innerHTML = '';
    app.appendChild(_buildLoginPage());
    return;
  }

  app.innerHTML = `
    <div id="sidebar">${_buildSidebar()}</div>
    <div id="main-content" id="main-content"></div>
  `;

  // Activate nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === _currentPage);
  });

  const content = el('main-content') || document.querySelector('#main-content');
  const entry = PAGES[_currentPage];
  if (entry) {
    try { entry.fn(content, _pageParams); }
    catch (e) {
      console.error(e);
      content.innerHTML = `<div class="alert alert-danger">⚠️ Une erreur est survenue : ${e.message}</div>`;
    }
  } else {
    renderAccueil(content);
  }

  // Wire nav clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  el('btn-logout')?.addEventListener('click', () => {
    logout();
    location.reload();
  });
}

// ── Sidebar ───────────────────────────────────────────────

function _buildSidebar() {
  const appName      = getSetting('app_name', 'Référentiel CU');
  const dept         = getSetting('app_department', '');
  const username     = getCurrentUsername();
  const admin        = isAdmin();
  const bilingual    = getSetting('bilingual_mode', 'false') === 'true';
  const userPays     = getUserPays();
  const tabFRLabel   = getSetting('special_tab_fr', 'Spécial France');
  const tabDELabel   = getSetting('special_tab_de', 'Spécial Allemagne');

  // Determine special tab label for this user
  let specialLabel = null;
  if (bilingual) {
    if (admin) {
      // Admin sees both — show both labels or generic
      specialLabel = `🌍 ${t('nav.special')}`;
    } else if (userPays === 'FR') {
      specialLabel = `🇫🇷 ${tabFRLabel}`;
    } else if (userPays === 'DE') {
      specialLabel = `🇩🇪 ${tabDELabel}`;
    }
  }

  // Pending badge
  let pendingBadge = '';
  if (admin) {
    try {
      const row = queryOne(`SELECT COUNT(*) AS cnt FROM requests WHERE statut='À analyser'`);
      if (row?.cnt > 0) pendingBadge = `<span class="nav-badge">${row.cnt}</span>`;
    } catch {}
  }

  const publicNav = `
    <div class="nav-section-label">${t('nav.admin') === 'Administration' ? 'Navigation' : 'Navigation'}</div>
    <button class="nav-item" data-page="accueil"><span class="nav-icon">🏠</span> ${t('nav.home')}</button>
    <button class="nav-item" data-page="catalogue"><span class="nav-icon">📚</span> ${t('nav.catalogue')}</button>
    <button class="nav-item" data-page="applications"><span class="nav-icon">🚀</span> ${t('nav.applications')}</button>
    <button class="nav-item" data-page="demande"><span class="nav-icon">📝</span> ${t('nav.submit')}</button>
    <button class="nav-item" data-page="assistant"><span class="nav-icon">🤖</span> ${t('nav.assistant')}</button>
    <button class="nav-item" data-page="guide"><span class="nav-icon">📖</span> ${t('nav.guide')}</button>
    <button class="nav-item" data-page="faq"><span class="nav-icon">❓</span> ${t('nav.faq')}</button>
    ${specialLabel ? `<button class="nav-item" data-page="special"><span class="nav-icon">🌍</span> ${specialLabel}</button>` : ''}
  `;

  const adminNav = admin ? `
    <div class="nav-section-label mt-2">${t('nav.admin')}</div>
    <button class="nav-item" data-page="admin_demandes"><span class="nav-icon">🔔</span> ${t('nav.admin.requests')} ${pendingBadge}</button>
    <button class="nav-item" data-page="admin_catalogue"><span class="nav-icon">🗂️</span> ${t('nav.admin.catalogue')}</button>
    <button class="nav-item" data-page="admin_archives"><span class="nav-icon">📦</span> ${t('nav.admin.archives')}</button>
    <button class="nav-item" data-page="admin_referentiels"><span class="nav-icon">🔧</span> ${t('nav.admin.referentiels')}</button>
    <button class="nav-item" data-page="admin_utilisateurs"><span class="nav-icon">👥</span> ${t('nav.admin.users')}</button>
    <button class="nav-item" data-page="admin_params_ia"><span class="nav-icon">🤖</span> ${t('nav.admin.params_ia')}</button>
    <button class="nav-item" data-page="admin_params"><span class="nav-icon">⚙️</span> ${t('nav.admin.params')}</button>
  ` : '';

  return `
    <div class="sidebar-logo">
      <div class="logo-icon">🔷</div>
      <div class="logo-title">${appName}</div>
      ${dept ? `<div class="logo-dept">${dept}</div>` : ''}
    </div>
    <div class="sidebar-profile">
      <strong>${username}</strong>
      ${admin ? '<span>Administrateur</span>' : '<span>Visiteur</span>'}
    </div>
    <nav class="sidebar-nav">
      ${publicNav}
      ${adminNav}
    </nav>
    <div class="sidebar-footer">
      <button class="btn-logout" id="btn-logout">🚪 Déconnexion</button>
    </div>
  `;
}

// ── Login page builder ────────────────────────────────────

function _buildLoginPage() {
  const wrap = document.createElement('div');
  wrap.id = 'login-page';
  wrap.innerHTML = `
    <div class="login-box">
      <div class="login-logo">
        <div class="icon">🔷</div>
        <h1>Référentiel des cas d'usage</h1>
        <p>Découvrez, explorez et contribuez aux projets de transformation.</p>
      </div>

      <div id="login-view-choice">
        <div class="profile-cards">
          <div class="profile-card" id="card-visitor">
            <div class="p-icon">👤</div>
            <div class="p-title">Visiteur</div>
            <div class="p-desc">Accès libre sans mot de passe</div>
          </div>
          <div class="profile-card" id="card-admin">
            <div class="p-icon">🔐</div>
            <div class="p-title">Administrateur</div>
            <div class="p-desc">Accès sécurisé</div>
          </div>
        </div>
      </div>

      <div id="login-view-form" style="display:none">
        <div class="alert alert-info">🔐 Connexion administrateur</div>
        <div id="login-error" style="display:none"></div>
        <div class="form-group">
          <label class="form-label" for="login-username">Identifiant</label>
          <input type="text" class="form-control" id="login-username" placeholder="Votre identifiant">
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Mot de passe</label>
          <input type="password" class="form-control" id="login-password" placeholder="Votre mot de passe">
        </div>
        <div class="flex gap-1">
          <button class="btn btn-ghost" id="btn-back-login">← Retour</button>
          <button class="btn btn-primary" id="btn-do-login" style="flex:1">🔐 Se connecter</button>
        </div>
      </div>
    </div>
  `;

  wrap.querySelector('#card-visitor').addEventListener('click', () => {
    loginVisitor();
    _render();
  });

  wrap.querySelector('#card-admin').addEventListener('click', () => {
    wrap.querySelector('#login-view-choice').style.display = 'none';
    wrap.querySelector('#login-view-form').style.display = '';
    wrap.querySelector('#login-username').focus();
  });

  wrap.querySelector('#btn-back-login').addEventListener('click', () => {
    wrap.querySelector('#login-view-choice').style.display = '';
    wrap.querySelector('#login-view-form').style.display = 'none';
  });

  const doLogin = async () => {
    const u = wrap.querySelector('#login-username').value;
    const p = wrap.querySelector('#login-password').value;
    const errEl = wrap.querySelector('#login-error');
    const { ok, msg } = await loginAdmin(u, p);
    if (ok) {
      _render();
    } else {
      errEl.style.display = '';
      errEl.className = 'alert alert-danger';
      errEl.innerHTML = `❌ ${msg}`;
    }
  };

  wrap.querySelector('#btn-do-login').addEventListener('click', doLogin);
  wrap.querySelector('#login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  return wrap;
}

// ── Boot ──────────────────────────────────────────────────

export async function boot() {
  const loadingEl = el('loading');
  try {
    await initDB();
    // Apply saved language
    const savedLang = getSetting('app_lang', 'fr');
    setLang(savedLang);
    if (loadingEl) loadingEl.style.display = 'none';
    _render();
  } catch (e) {
    console.error('Boot failed:', e);
    if (loadingEl) {
      loadingEl.innerHTML = `<div class="alert alert-danger">
        ❌ Erreur de démarrage : ${e.message}<br>
        <small>Vérifiez votre connexion internet (sql.js est chargé depuis un CDN).</small>
      </div>`;
    }
  }
}

// Expose navigate globally for inline onclick handlers
window.navigate     = navigate;
window.getPageParams = getPageParams;
window.setPageParam  = setPageParam;
window.closeModal    = closeModal;
