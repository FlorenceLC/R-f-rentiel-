/**
 * ROI module — calcul centralisé du ROI à partir des données du formulaire.
 *
 * Méthode (paramétrable dans Paramètres généraux) :
 *   Jours/livrable   = temps (converti en jours) × nombre de personnes
 *   Heures           = jours × heures/jour            (défaut 7,37 h/j)
 *   Coût             = heures × coût horaire          (défaut 112 €/h)
 *   ROI / livrable   = coût × (gain IA % / 100)
 *   ROI annuel       = ROI / livrable × livrables par an
 */
import { getSetting, query } from './db.js';

// Conversions en jours ouvrés (hors heure, qui dépend des heures/jour)
const JOURS_PAR_UNITE = { jour: 1, semaine: 5, mois: 21, 'année': 220 };

export const DEFAULT_DIRECTIONS = [
  'Direction Générale','Direction Financière','Direction des Ressources Humaines',
  'Direction des Systèmes d\'Information','Direction Commerciale / Ventes','Direction Marketing',
  'Direction des Achats','Direction de la Production','Direction Qualité','Direction Juridique',
  'Direction de la Supply Chain / Logistique','Direction de la Recherche & Développement',
  'Direction de la Communication','Direction de la Transformation / Innovation',
  'Direction des Projets','Direction Industrielle','Direction Technique','Direction Sécurité','Autre',
];

export function getRoiParams() {
  const hj = parseFloat(String(getSetting('roi_heures_jour', '7.37')).replace(',', '.'));
  const ch = parseFloat(String(getSetting('roi_cout_horaire', '112')).replace(',', '.'));
  return { heuresJour: hj > 0 ? hj : 7.37, coutHoraire: ch > 0 ? ch : 112 };
}

/** Liste des directions/services actives (personnalisable dans Référentiels) */
export function getDirections() {
  try {
    const rows = query(`SELECT libelle FROM directions WHERE actif=1 ORDER BY ordre, id`);
    if (rows.length) return rows.map(r => r.libelle);
  } catch { /* table absente */ }
  return DEFAULT_DIRECTIONS;
}

/** Temps d'une occurrence converti en jours */
export function tempsEnJours(temps, unite, p = getRoiParams()) {
  if (!(temps > 0)) return null;
  if (unite === 'heure') return temps / p.heuresJour;
  const k = JOURS_PAR_UNITE[unite];
  return k ? temps * k : null;
}

/** Heures/an = temps × personnes × volume annuel (valeur de l'étiquette du formulaire) */
export function heuresParAn(d, p = getRoiParams()) {
  const j = tempsEnJours(Number(d.temps_actuel), d.unite_temps, p);
  const n = Number(d.nombre_personnes), v = Number(d.volume_annuel);
  if (j == null || !(n > 0) || !(v >= 0) || d.volume_annuel === '' || d.volume_annuel == null) return null;
  return j * p.heuresJour * n * v;
}

const fr = (x, dec = 2) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: dec });

/** Calcule le ROI. Retourne { roi, heuresAn, lines[], warnings[] } (roi = null si donnée manquante) */
export function calcRoi(d, gainPct) {
  const p = getRoiParams();
  const warnings = [], lines = [];
  const temps = Number(d.temps_actuel), n = Number(d.nombre_personnes);
  const vol = (d.volume_annuel === '' || d.volume_annuel == null) ? NaN : Number(d.volume_annuel);
  const gain = (gainPct === '' || gainPct == null) ? NaN : Number(gainPct);

  if (!(temps > 0)) warnings.push('Temps actuel consacré non renseigné.');
  if (!d.unite_temps) warnings.push('Unité de temps non renseignée.');
  if (!(n > 0)) warnings.push('Nombre de personnes impliquées non renseigné.');
  if (!(vol >= 0)) warnings.push('Volume annuel (livrables/an) non renseigné.');
  if (!(gain >= 0)) warnings.push('Gain IA (%) non renseigné — saisissez-le pour obtenir le ROI.');

  const jours = tempsEnJours(temps, d.unite_temps, p);
  const heuresAn = heuresParAn(d, p);
  let roi = null;

  if (jours != null && n > 0) {
    const joursLiv = jours * n;
    const heures = joursLiv * p.heuresJour;
    const cout = heures * p.coutHoraire;
    lines.push(`Jours / livrable = ${fr(temps)} ${d.unite_temps}(s) → ${fr(jours)} j × ${fr(n, 0)} pers. = <strong>${fr(joursLiv)} j</strong>`);
    lines.push(`Heures = ${fr(joursLiv)} j × ${fr(p.heuresJour)} h/j = <strong>${fr(heures)} h</strong>`);
    lines.push(`Coût = ${fr(heures)} h × ${fr(p.coutHoraire, 0)} €/h = <strong>${fr(cout, 0)} €</strong> par livrable`);
    if (gain >= 0) {
      const roiLiv = cout * (gain / 100);
      lines.push(`ROI / livrable = ${fr(cout, 0)} € × ${fr(gain)} % = <strong>${fr(roiLiv, 0)} €</strong>`);
      if (vol >= 0) {
        roi = Math.round(roiLiv * vol);
        if (heuresAn != null) lines.push(`Heures libérées / an = ${fr(heuresAn, 0)} h de temps passé × ${fr(gain)} % = <strong>${fr(heuresAn * gain / 100, 0)} h</strong>`);
        lines.push(`ROI annuel = ${fr(roiLiv, 0)} € × ${fr(vol, 0)} livrables/an = <strong>${fr(roi, 0)} €/an</strong>`);
      }
    }
  }
  return { roi, heuresAn, lines, warnings, params: p };
}

/** Bloc HTML « proposition de ROI » (détail + warnings) */
export function roiBoxHTML(calc) {
  const warn = calc.warnings.length
    ? `<div style="background:#fffaf0;border:1px solid #f6ad55;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#744210;">
        ⚠️ <strong>Donnée(s) manquante(s) :</strong><ul style="margin:4px 0 0 18px;">${calc.warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>` : '';
  const head = calc.roi != null
    ? `<div style="font-size:20px;font-weight:800;color:#276749;">${fr(calc.roi, 0)} €/an</div>`
    : `<div style="font-size:14px;font-weight:700;color:#c05621;">ROI non calculable</div>`;
  return `<div style="border:1px solid #9ae6b4;background:#f0fff4;border-radius:8px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#276749;margin-bottom:4px;">💡 ROI proposé</div>
      ${head}
      ${calc.lines.length ? `<div style="font-size:12px;color:#2d3748;margin-top:8px;line-height:1.7;">${calc.lines.map(l => `<div>• ${l}</div>`).join('')}</div>` : ''}
      ${warn}
    </div>`;
}

export function parseExtras(json) {
  if (!json) return {};
  try { const o = JSON.parse(json); return (o && typeof o === 'object') ? o : {}; } catch { return {}; }
}

/** Toutes les données du formulaire de demande, prêtes à pré-remplir la fiche CU */
export function buildCuExtras(req) {
  const e = parseExtras(req.commentaire);
  const legacyComment = (!Object.keys(e).length && req.commentaire) ? req.commentaire : null;
  const out = {
    contexte: req.contexte || null,
    objectif: req.objectif || null,
    commentaire_libre: e.commentaire_libre || legacyComment || null,
    titre_ia: e.titre_ia || null,
    priorite: e.priorite || null,
    justif_priorite: e.justif_priorite || null,
    types_donnees: e.types_donnees || null,
    systemes_selectionnes: e.systemes_selectionnes || null,
    rgpd: e.rgpd || null,
    dispo_donnees: e.dispo_donnees || null,
    sources_donnees: e.sources_donnees || null,
    confidentialite: e.confidentialite || null,
    donnees_externes: e.donnees_externes || null,
    details_externes: e.details_externes || null,
    benefice_attendu: e.benefice_attendu || null,
    autre_benefice: e.autre_benefice || null,
    temps_actuel: req.temps_actuel ?? null,
    unite_temps: req.unite_temps || null,
    nombre_personnes: req.nombre_personnes ?? null,
    volume_annuel: req.volume_annuel ?? null,
    gain_ia_pct: e.gain_ia_pct ?? null,
    gain_ia_justif: e.gain_ia_justif || null,
    direction: req.direction || null,
    demandeur: `${req.prenom || ''} ${req.nom || ''}`.trim() || null,
  };
  out.heures_an = heuresParAn(out);
  return out;
}

export function formatHeures(h) {
  return h == null ? '' : `${fr(h, 0)} h/an`;
}
