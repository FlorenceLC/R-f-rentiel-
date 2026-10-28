/**
 * mailer.js — Envoi d'un mail récapitulatif lors de la soumission d'un besoin.
 * Priorité : API mail configurée (mail_api_url) → fallback mailto: (client natif).
 */
import { getSetting } from './db.js';

export async function sendRequestRecap(data) {
  const adminEmail = getSetting('app_contact_email', '');
  if (!adminEmail) return { ok: false, reason: 'no_email' };

  const appName = getSetting('app_name', 'Référentiel des cas d\'usage');
  const extras  = _parseExtras(data.commentaire);
  const subject = `[${appName}] Nouvelle demande — ${data.dem_id}`;

  const textBody = _buildTextBody(data, extras, appName);
  const htmlBody = _buildHtmlBody(data, extras, appName);

  // Tentative via API mail si configurée
  const mailApiUrl = getSetting('mail_api_url', '');
  if (mailApiUrl) {
    try {
      const resp = await fetch(mailApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: adminEmail, subject, text: textBody, html: htmlBody }),
      });
      if (resp.ok) return { ok: true, method: 'api' };
    } catch (e) {
      console.warn('[mailer] API mail failed, fallback mailto:', e.message);
    }
  }

  // Fallback mailto
  const cc      = getSetting('app_contact_cc', '');
  const ccPart  = cc ? `&cc=${encodeURIComponent(cc)}` : '';
  const mailto  = `mailto:${encodeURIComponent(adminEmail)}?subject=${encodeURIComponent(subject)}${ccPart}&body=${encodeURIComponent(textBody)}`;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  try { iframe.contentWindow.location.href = mailto; } catch {}
  setTimeout(() => iframe.remove(), 3000);

  return { ok: true, method: 'mailto' };
}

function _parseExtras(commentaireJson) {
  if (!commentaireJson) return {};
  try { return JSON.parse(commentaireJson); } catch { return {}; }
}

// ── Corps texte (fallback) ──────────────────────────────────────────────────
function _buildTextBody(data, extras, appName) {
  const e   = extras;
  const roi = (data.temps_actuel && data.nombre_personnes && data.volume_annuel)
    ? `${data.temps_actuel * data.nombre_personnes * data.volume_annuel} ${data.unite_temps || 'heure'}(s)/an`
    : null;

  const lines = [
    `${appName} — Nouvelle demande soumise`,
    `═══════════════════════════════════════`,
    ``,
    `📋 Référence       : ${data.dem_id}`,
    `📅 Date            : ${new Date().toLocaleString('fr-FR')}`,
    ``,
    `──── DEMANDEUR ────`,
    `Nom               : ${data.prenom} ${data.nom}`,
    `Email             : ${data.email}`,
    `Direction         : ${data.direction}`,
    data.entite ? `Entité            : ${data.entite === 'FR' ? '🇫🇷 France' : '🇩🇪 Allemagne'}` : null,
    ``,
    `──── BESOIN ────`,
    `Contexte          : ${data.contexte}`,
    ``,
    `Objectif          : ${data.objectif}`,
    e.priorite ? `Priorité souhaitée: ${e.priorite}` : null,
    e.justif_priorite ? `Justification     : ${e.justif_priorite}` : null,
    ``,
    (e.types_donnees?.length) ? `──── DONNÉES ────` : null,
    (e.types_donnees?.length) ? `Types de données  : ${Array.isArray(e.types_donnees) ? e.types_donnees.join(', ') : e.types_donnees}` : null,
    e.rgpd              ? `RGPD              : ${e.rgpd}` : null,
    e.dispo_donnees     ? `Disponibilité     : ${e.dispo_donnees}` : null,
    e.confidentialite   ? `Confidentialité   : ${e.confidentialite}` : null,
    e.donnees_externes  ? `Données externes  : ${e.donnees_externes}` : null,
    ``,
    `──── ROI ────`,
    e.benefice_attendu ? `Bénéfice attendu  : ${e.benefice_attendu}` : null,
    data.temps_actuel  ? `Temps actuel      : ${data.temps_actuel} ${data.unite_temps || ''}` : null,
    data.nombre_personnes ? `Personnes         : ${data.nombre_personnes}` : null,
    data.volume_annuel    ? `Volume/an         : ${data.volume_annuel} occurrence(s)` : null,
    roi                   ? `ROI calculé       : ${roi}` : null,
    e.gain_ia_pct != null ? `Gain IA estimé    : ${e.gain_ia_pct} %` : null,
    ``,
    e.titre_ia ? `──── ANALYSE IA ────` : null,
    e.titre_ia        ? `Titre suggéré     : ${e.titre_ia}` : null,
    data.type_besoin_ia ? `Type de besoin    : ${data.type_besoin_ia}` : null,
    data.technologie_ia ? `Technologie       : ${data.technologie_ia}` : null,
    ``,
    `═══════════════════════════════════════`,
    `Connectez-vous à l'interface administrateur pour traiter cette demande.`,
    `Ce message est généré automatiquement par ${appName}.`,
  ].filter(l => l !== null).join('\n');

  return lines;
}

// ── Corps HTML (si API mail supporte HTML) ──────────────────────────────────
function _buildHtmlBody(data, extras, appName) {
  const e   = extras;
  const roi = (data.temps_actuel && data.nombre_personnes && data.volume_annuel)
    ? `${(data.temps_actuel * data.nombre_personnes * data.volume_annuel).toLocaleString('fr-FR')} ${data.unite_temps || 'heure'}(s)/an`
    : null;

  const row = (icon, label, value, highlight = false) =>
    value ? `<tr>
      <td style="padding:7px 12px;font-size:12px;color:#718096;white-space:nowrap;vertical-align:top;">${icon} ${label}</td>
      <td style="padding:7px 12px;font-size:13px;color:${highlight ? '#276749' : '#2d3748'};font-weight:${highlight ? '700' : '500'};vertical-align:top;">${value}</td>
    </tr>` : '';

  const section = (icon, title, rows) => `
    <div style="margin-bottom:20px;">
      <div style="background:#1e3a5f;color:white;padding:8px 16px;border-radius:6px 6px 0 0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">
        ${icon} ${title}
      </div>
      <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 6px 6px;">
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;

  const prioriteBadge = e.priorite ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${e.priorite==='Élevée'?'#fed7d7':e.priorite==='Moyenne'?'#fefcbf':'#e8f5e9'};color:${e.priorite==='Élevée'?'#c53030':e.priorite==='Moyenne'?'#975a16':'#276749'};">${e.priorite}</span>` : '—';

  const typesDonneesStr = Array.isArray(e.types_donnees) ? e.types_donnees.join(', ') : (e.types_donnees || null);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;">
<tr><td align="center" style="padding:32px 16px;">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2b6cb0 100%);border-radius:10px 10px 0 0;padding:28px 32px;">
    <div style="color:white;">
      <div style="font-size:22px;font-weight:800;margin-bottom:4px;">📋 Nouvelle demande soumise</div>
      <div style="font-size:13px;opacity:.85;">${appName}</div>
    </div>
  </td></tr>

  <!-- Référence banner -->
  <tr><td style="background:#ebf4ff;border:1px solid #bee3f8;border-top:none;padding:14px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-size:11px;color:#4a90c4;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Référence</span><br>
        <span style="font-size:20px;font-weight:800;color:#1a365d;font-family:monospace;">${data.dem_id}</span>
      </td>
      <td align="right" style="font-size:12px;color:#718096;">
        📅 ${new Date().toLocaleString('fr-FR')}
      </td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:white;padding:24px 32px;border:1px solid #e2e8f0;border-top:none;">

    ${section('👤', 'Demandeur', [
      row('', 'Nom', `${data.prenom} ${data.nom}`),
      row('✉️', 'Email', `<a href="mailto:${data.email}" style="color:#2b6cb0;">${data.email}</a>`),
      row('🏢', 'Direction', data.direction),
      data.entite ? row('🌍', 'Entité', data.entite === 'FR' ? '🇫🇷 KNDS France' : '🇩🇪 KNDS Allemagne') : '',
    ])}

    ${section('📝', 'Besoin', [
      row('🔍', 'Contexte', `<span style="white-space:pre-wrap;">${data.contexte}</span>`),
      row('🎯', 'Objectif', `<span style="white-space:pre-wrap;">${data.objectif}</span>`),
      e.priorite ? `<tr><td style="padding:7px 12px;font-size:12px;color:#718096;white-space:nowrap;vertical-align:top;">⚡ Priorité</td><td style="padding:7px 12px;vertical-align:top;">${prioriteBadge}</td></tr>` : '',
      e.justif_priorite ? row('📌', 'Justification', e.justif_priorite) : '',
    ])}

    ${(typesDonneesStr || e.rgpd || e.dispo_donnees || e.confidentialite) ? section('📂', 'Données', [
      typesDonneesStr    ? row('📄', 'Types de données', typesDonneesStr) : '',
      e.rgpd             ? row('🔒', 'RGPD', e.rgpd) : '',
      e.dispo_donnees    ? row('✅', 'Disponibilité', e.dispo_donnees) : '',
      e.confidentialite  ? row('🛡️', 'Confidentialité', e.confidentialite) : '',
      e.donnees_externes ? row('🌐', 'Données externes', e.donnees_externes) : '',
      e.sources_donnees  ? row('📁', 'Sources', e.sources_donnees) : '',
    ]) : ''}

    ${section('💰', 'ROI & Bénéfice', [
      e.benefice_attendu   ? row('🎁', 'Bénéfice attendu', e.benefice_attendu) : '',
      data.temps_actuel    ? row('⏱️', 'Temps actuel', `${data.temps_actuel} ${data.unite_temps || ''}`) : '',
      data.nombre_personnes? row('👥', 'Personnes impliquées', `${data.nombre_personnes}`) : '',
      data.volume_annuel   ? row('🔁', 'Volume annuel', `${data.volume_annuel} occurrence(s)`) : '',
      roi                  ? row('📈', 'ROI calculé', roi, true) : '',
      e.gain_ia_pct != null ? row('✨', 'Gain IA estimé', `${e.gain_ia_pct} %`) : '',
    ])}

    ${(e.titre_ia || data.type_besoin_ia) ? section('🤖', 'Analyse IA', [
      e.titre_ia          ? `<tr><td colspan="2" style="padding:10px 12px;">
        <div style="background:#f0f7ff;border:1px solid #90cdf4;border-radius:6px;padding:10px 14px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4a90c4;margin-bottom:4px;">Titre suggéré</div>
          <div style="font-size:14px;font-weight:700;color:#1a365d;">💡 ${e.titre_ia}</div>
        </div></td></tr>` : '',
      data.type_besoin_ia ? row('🏷️', 'Type de besoin', data.type_besoin_ia) : '',
      data.technologie_ia ? row('⚙️', 'Technologie', data.technologie_ia) : '',
      data.analyse_ia     ? row('📋', 'Analyse', `<span style="font-size:12px;font-style:italic;color:#4a5568;">${data.analyse_ia}</span>`) : '',
    ]) : ''}

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1e3a5f;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center;">
    <div style="font-size:11px;color:#90b8d8;">
      Ce message est généré automatiquement par <strong style="color:white;">${appName}</strong>.<br>
      Connectez-vous à l'interface administrateur pour traiter cette demande.
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}
