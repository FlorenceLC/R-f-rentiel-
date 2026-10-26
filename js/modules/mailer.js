/**
 * mailer.js — Envoi d'un mail récapitulatif lors de la soumission d'un besoin.
 * Utilise mailto: (client mail natif) car il n'y a pas de backend.
 * Si une API d'envoi mail est configurée (setting mail_api_url), l'utilise à la place.
 */
import { getSetting } from './db.js';

/**
 * Construit et déclenche l'envoi d'un mail récapitulatif de demande.
 * @param {Object} data - L'objet _data du formulaire demande
 * @returns {{ ok: boolean, method: string }}
 */
export async function sendRequestRecap(data) {
  const adminEmail = getSetting('app_contact_email', '');
  if (!adminEmail) return { ok: false, reason: 'no_email' };

  const appName = getSetting('app_name', 'Référentiel des cas d\'usage');
  const extras  = _parseExtras(data.commentaire);

  const subject = encodeURIComponent(
    `[${appName}] Nouvelle demande soumise — ${data.dem_id}`
  );

  const body = _buildBody(data, extras, appName);

  // Tentative via API mail si configurée
  const mailApiUrl = getSetting('mail_api_url', '');
  if (mailApiUrl) {
    try {
      const resp = await fetch(mailApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      adminEmail,
          subject: decodeURIComponent(subject),
          text:    body,
        }),
      });
      if (resp.ok) return { ok: true, method: 'api' };
    } catch (e) {
      console.warn('[mailer] API mail failed, falling back to mailto:', e.message);
    }
  }

  // Fallback : mailto (ouvre le client mail natif)
  const mailtoBody = encodeURIComponent(body);
  const cc = getSetting('app_contact_cc', '');
  const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : '';
  const mailto = `mailto:${encodeURIComponent(adminEmail)}?subject=${subject}${ccPart}&body=${mailtoBody}`;

  // Ouvre dans un iframe caché pour éviter de quitter la page
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  try {
    iframe.contentWindow.location.href = mailto;
  } catch {}
  setTimeout(() => iframe.remove(), 3000);

  return { ok: true, method: 'mailto' };
}

function _parseExtras(commentaireJson) {
  if (!commentaireJson) return {};
  try { return JSON.parse(commentaireJson); } catch { return {}; }
}

function _buildBody(data, extras, appName) {
  const line = (label, value) => value ? `${label} : ${value}\n` : '';
  const sep  = () => '─'.repeat(50) + '\n';

  const prioriteLabel = extras.priorite || data.priorite || null;
  const typesDonnees  = Array.isArray(extras.types_donnees)
    ? extras.types_donnees.join(', ')
    : null;
  const benefice = extras.benefice_attendu || null;
  const roiCalc  = (data.temps_actuel && data.nombre_personnes && data.volume_annuel)
    ? `${data.temps_actuel * data.nombre_personnes * data.volume_annuel} ${data.unite_temps || 'heure'}s/an`
    : null;

  return `Une nouvelle demande a été soumise sur ${appName}.

${sep()}
📋 RÉFÉRENCE : ${data.dem_id}
${sep()}

👤 DEMANDEUR
${line('Nom',        `${data.prenom} ${data.nom}`)}${line('Email',     data.email)}${line('Direction', data.direction)}${data.entite ? line('Entité', data.entite === 'FR' ? '🇫🇷 France' : '🇩🇪 Allemagne') : ''}
${sep()}
📝 BESOIN
${line('Contexte',  data.contexte)}${line('Objectif',   data.objectif)}${prioriteLabel ? line('Priorité souhaitée', prioriteLabel) : ''}${extras.justif_priorite ? line('Justification priorité', extras.justif_priorite) : ''}
${sep()}
${typesDonnees ? `📂 DONNÉES\n${line('Types de données', typesDonnees)}${line('Respect RGPD', extras.rgpd)}${line('Disponibilité des données', extras.dispo_donnees)}${line('Confidentialité', extras.confidentialite)}\n${sep()}\n` : ''}
💰 ROI ESTIMÉ
${benefice ? line('Bénéfice attendu', benefice) : ''}${line('Temps actuel', `${data.temps_actuel || '—'} ${data.unite_temps || ''}`)}${line('Personnes impliquées', data.nombre_personnes)}${line('Volume annuel', data.volume_annuel)}${roiCalc ? line('ROI calculé', roiCalc) : ''}${extras.gain_outil ? line('Gain estimé (outil)', extras.gain_outil) : ''}
${sep()}
${extras.titre_ia ? `🤖 ANALYSE IA\n${line('Titre suggéré', extras.titre_ia)}${line('Type de besoin', data.type_besoin_ia)}${line('Technologie', data.technologie_ia)}\n${sep()}\n` : ''}
Ce message a été généré automatiquement par ${appName}.
Connectez-vous à l'interface administrateur pour traiter cette demande.
`;
}
