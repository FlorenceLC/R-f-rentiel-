import { query, getSetting } from '../modules/db.js';

export function renderGuide(container) {
  const dept    = getSetting('app_department', 'Direction de l\'Innovation');
  const email   = getSetting('app_contact_email', 'innovation@entreprise.fr');
  const cc      = getSetting('app_contact_cc', '');
  const subject = getSetting('app_contact_subject', 'Demande d\'information');
  const body    = getSetting('app_contact_body', '');

  // Build mailto URL
  const mailtoParams = [];
  if (cc)      mailtoParams.push(`cc=${encodeURIComponent(cc)}`);
  if (subject) mailtoParams.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    mailtoParams.push(`body=${encodeURIComponent(body)}`);
  const mailtoUrl = `mailto:${email}${mailtoParams.length ? '?' + mailtoParams.join('&') : ''}`;

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>📖 Guide d'utilisation</h1>
      <p>Tout ce que vous devez savoir pour utiliser l'application.</p>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
      <div>
        <div class="card mb-2">
          <div class="card-header"><span>🔷</span><div class="card-title">Qu'est-ce que le Référentiel ?</div></div>
          <p style="font-size:13px;line-height:1.7;color:var(--gray)">
            Le Référentiel des cas d'usage est une application qui centralise tous les projets de transformation digitale
            portés par notre département. Il permet à tous les collaborateurs de découvrir les initiatives en cours,
            d'accéder aux applications disponibles et de soumettre de nouveaux besoins.
          </p>
        </div>

        <div class="card mb-2">
          <div class="card-header"><span>📋</span><div class="card-title">Cycle de vie d'un cas d'usage</div></div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${[
              ['Besoin identifié', '📋', 'Le besoin a été reçu et intégré dans notre backlog. Il sera priorisé selon les ressources disponibles.'],
              ['Cadrage', '📝', 'Notre équipe analyse le besoin, définit le périmètre et les solutions envisagées.'],
              ['POC', '🧪', 'Un prototype est développé pour valider la faisabilité technique.'],
              ['En développement', '⚙️', 'La solution est en cours de développement complet.'],
              ['Production', '🚀', 'La solution est déployée et disponible pour les utilisateurs.'],
            ].map(([s, icon, desc]) => `
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <span style="font-size:1.3rem;flex-shrink:0;">${icon}</span>
                <div>
                  <div style="font-weight:700;font-size:13px;color:var(--blue-dark)">${s}</div>
                  <div class="text-sm text-muted">${desc}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="card mb-2">
          <div class="card-header"><span>📝</span><div class="card-title">Comment soumettre un besoin ?</div></div>
          <ol style="font-size:13px;line-height:2;padding-left:18px;color:var(--gray);">
            <li>Cliquez sur <strong>«&nbsp;Soumettre un besoin&nbsp;»</strong> dans le menu.</li>
            <li>Renseignez vos coordonnées (nom, prénom, email, direction).</li>
            <li>Décrivez votre contexte actuel et l'objectif visé.</li>
            <li>Estimez si possible le temps gagné pour calculer le ROI.</li>
            <li>Notre IA analyse votre demande et détecte les projets similaires existants.</li>
            <li>Votre demande est enregistrée — notre équipe vous répond sous 5 jours ouvrés.</li>
          </ol>
        </div>
      </div>

      <div>
        <div class="card mb-2" style="background:linear-gradient(135deg,var(--blue-dark),var(--blue-mid));color:white;">
          <div style="font-size:1.5rem;margin-bottom:8px;">📬</div>
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Contacter le département</div>
          <div style="font-size:12px;color:var(--blue-border);margin-bottom:12px;">${dept}</div>
          <a href="${mailtoUrl}" class="btn btn-outline" style="border-color:rgba(255,255,255,0.4);color:var(--blue-dark);background:white;font-size:12px;font-weight:600;">
            ✉️ Nous contacter
          </a>
        </div>

        <div class="card mb-2">
          <div class="card-header"><span>⏱️</span><div class="card-title">Délais indicatifs</div></div>
          ${[
            ['Accusé de réception', '5 jours ouvrés'],
            ['Phase de cadrage', '2–4 semaines'],
            ['POC', '4–8 semaines'],
            ['Développement complet', 'Variable'],
          ].map(([l, v]) => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-border);font-size:13px;">
              <span>${l}</span><strong style="color:var(--blue-mid)">${v}</strong>
            </div>`).join('')}
        </div>

        <div class="card">
          <div class="card-header"><span>💡</span><div class="card-title">Conseils</div></div>
          <ul style="font-size:12px;line-height:1.9;padding-left:16px;color:var(--gray);">
            <li>Consultez le catalogue avant de soumettre pour éviter les doublons.</li>
            <li>Plus votre description est précise, plus l'analyse sera pertinente.</li>
            <li>L'estimation du ROI accélère la priorisation de votre besoin.</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

export function renderFAQ(container) {
  const faqs = query(`SELECT * FROM faq WHERE actif=1 ORDER BY ordre ASC`);
  const categories = [...new Set(faqs.map(f => f.categorie))];

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>❓ Foire Aux Questions</h1>
      <p>Les réponses aux questions les plus fréquentes.</p>
    </div>
    <div style="display:grid;grid-template-columns:3fr 1fr;gap:20px;">
      <div id="faq-content">
        ${categories.map(cat => `
          <div class="mb-3">
            <div class="section-title mb-2">📂 ${cat}</div>
            ${faqs.filter(f => f.categorie === cat).map((f, i) => `
              <div class="card mb-1" style="padding:0;overflow:hidden;">
                <button class="faq-q" data-idx="${cat}-${i}" style="
                  width:100%;text-align:left;padding:14px 16px;background:none;border:none;
                  cursor:pointer;font-size:13px;font-weight:600;color:var(--blue-dark);
                  display:flex;justify-content:space-between;align-items:center;">
                  ${f.question}
                  <span class="faq-chevron" style="flex-shrink:0;margin-left:8px;color:var(--gray)">▼</span>
                </button>
                <div class="faq-a" id="faq-${cat}-${i}" style="display:none;padding:0 16px 14px;font-size:13px;color:var(--gray);line-height:1.7;">
                  ${f.reponse}
                </div>
              </div>`).join('')}
          </div>`).join('')}
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span>🔍</span><div class="card-title">Catégories</div></div>
          ${categories.map(c => `
            <div style="padding:6px 0;border-bottom:1px solid var(--gray-border);font-size:13px;">
              📂 ${c} <span class="text-muted">(${faqs.filter(f=>f.categorie===c).length})</span>
            </div>`).join('')}
          <div class="mt-2 text-sm text-muted">Vous ne trouvez pas votre réponse ?</div>
          <button class="btn btn-primary btn-sm btn-block mt-1" onclick="navigate('guide')">Contacter le département</button>
        </div>
      </div>
    </div>
  `;

  // Accordion logic
  container.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = btn.dataset.idx;
      const body = container.querySelector(`#faq-${idx}`);
      const chev = btn.querySelector('.faq-chevron');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      chev.textContent = isOpen ? '▼' : '▲';
    });
  });
}
