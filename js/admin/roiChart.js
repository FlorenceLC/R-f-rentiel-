/**
 * admin/roiChart.js — Graphique interactif « Évolution du ROI par année de création »
 *  - courbes ROI estimé total / ROI confirmé total (CU en production)
 *  - courbes par direction (masquées par défaut), jeux de couleurs au choix
 *  - chaque courbe peut être affichée / masquée en cliquant sur sa pastille
 * Un CU rattaché à plusieurs directions voit son ROI réparti à parts égales.
 */
import { splitDirs } from '../modules/roi.js';

const PALETTES = {
  standard:  { label: 'Standard',  colors: ['#3182ce','#e53e3e','#805ad5','#dd6b20','#319795','#d53f8c','#2f855a','#b7791f','#4c51bf','#718096'] },
  daltonien: { label: 'Daltonien (Okabe-Ito)', colors: ['#0072B2','#E69F00','#009E73','#D55E00','#CC79A7','#56B4E9','#F0E442','#000000'] },
  vif:       { label: 'Vif (dégradé de teintes)', gen: true },
};
const colorFor = (pal, i) => PALETTES[pal].gen
  ? `hsl(${Math.round((i * 137.5) % 360)},72%,44%)`
  : PALETTES[pal].colors[i % PALETTES[pal].colors.length];

const C_EST = '#d69e2e', C_CONF = '#276749', C_NONE = '#a0aec0';
const NONE = '__none__';

const short = v => {
  if (!v) return '0';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M€';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
  return Math.round(v) + '€';
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** rows : [{ annee, roi, statut, direction }] */
export function mountRoiYearChart(el, rows) {
  rows = rows.filter(r => r.annee);
  const years = [...new Set(rows.map(r => r.annee))].sort();
  if (!years.length) {
    el.innerHTML = '<div class="text-muted text-sm" style="padding:20px;text-align:center;">Pas encore de données annuelles</div>';
    return;
  }

  const st = { palette: 'standard', mode: 'estime', cumul: false, hidden: new Set() };
  // Directions masquées par défaut → lisibilité
  const allDirs = new Set();
  rows.forEach(r => { const d = splitDirs(r.direction); (d.length ? d : [NONE]).forEach(x => allDirs.add(x)); });
  allDirs.forEach(d => st.hidden.add('dir:' + d));

  const series = () => {
    const zero = () => Object.fromEntries(years.map(y => [y, 0]));
    const est = zero(), conf = zero(), dirs = {};
    rows.forEach(r => {
      const roi = Number(r.roi) || 0;
      est[r.annee] += roi;
      const prod = r.statut === 'Production';
      if (prod) conf[r.annee] += roi;
      if (st.mode === 'confirme' && !prod) return;
      const ds = splitDirs(r.direction);
      const list = ds.length ? ds : [NONE];
      list.forEach(d => { dirs[d] ??= zero(); dirs[d][r.annee] += roi / list.length; });
    });
    const toArr = o => {
      let acc = 0;
      return years.map(y => st.cumul ? (acc += o[y]) : o[y]);
    };
    const dirList = Object.entries(dirs)
      .map(([d, o]) => ({ key: 'dir:' + d, name: d === NONE ? 'Sans direction' : d, vals: toArr(o), none: d === NONE }))
      .sort((a, b) => (a.none - b.none) || (b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)));
    // les directions sans aucun ROI dans le mode choisi restent listées (valeurs 0)
    allDirs.forEach(d => { if (!dirs[d]) dirList.push({ key: 'dir:' + d, name: d === NONE ? 'Sans direction' : d, vals: years.map(() => 0), none: d === NONE }); });
    return {
      totals: [
        { key: 'tot:est',  name: 'ROI estimé total (hors Abandonné)', vals: toArr(est),  color: C_EST,  total: true },
        { key: 'tot:conf', name: 'ROI confirmé total (Production)',    vals: toArr(conf), color: C_CONF, total: true },
      ],
      dirList,
    };
  };

  const draw = () => {
    const { totals, dirList } = series();
    dirList.forEach((s, i) => { s.color = s.none ? C_NONE : colorFor(st.palette, i); });
    const all = [...totals, ...dirList];
    const visible = all.filter(s => !st.hidden.has(s.key));

    const W = 720, H = 300, P = { t: 18, r: 24, b: 32, l: 52 };
    const cw = W - P.l - P.r, chh = H - P.t - P.b;
    const max = Math.max(...visible.flatMap(s => s.vals), 1);
    const x = i => years.length > 1 ? P.l + (i / (years.length - 1)) * cw : P.l + cw / 2;
    const y = v => P.t + chh - (v / max) * chh;

    const grid = [0, .25, .5, .75, 1].map(f => {
      const v = max * f, yy = y(v);
      return `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="#edf2f7"/>
              <text x="${P.l - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#a0aec0">${short(v)}</text>`;
    }).join('');
    const xl = years.map((yr, i) => `<text x="${x(i)}" y="${H - P.b + 16}" text-anchor="middle" font-size="10" fill="#718096">${yr}</text>`).join('');

    // directions d'abord, totaux au-dessus
    const drawSeries = s => {
      const pts = s.vals.map((v, i) => `${x(i)},${y(v)}`);
      const w = s.total ? 3 : 1.8, dash = s.key === 'tot:est' ? '' : '';
      const line = years.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-linejoin="round" ${dash}/>` : '';
      const dots = s.vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${s.total ? 4.5 : 3.2}" fill="${s.color}" stroke="#fff" stroke-width="1.2"><title>${esc(s.name)} — ${years[i]} : ${Math.round(v).toLocaleString('fr-FR')} €</title></circle>`).join('');
      const labels = s.total ? s.vals.map((v, i) => `<text x="${x(i)}" y="${y(v) - 9}" text-anchor="middle" font-size="9" font-weight="600" fill="${s.color}">${short(v)}</text>`).join('') : '';
      return line + dots + labels;
    };
    const body = [...visible.filter(s => !s.total), ...visible.filter(s => s.total)].map(drawSeries).join('');

    const chip = s => {
      const off = st.hidden.has(s.key);
      return `<button type="button" data-k="${esc(s.key)}" title="${off ? 'Afficher' : 'Masquer'} cette courbe"
        style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${off ? '#e2e8f0' : s.color};background:${off ? '#f7fafc' : '#fff'};color:${off ? '#a0aec0' : '#2d3748'};
        border-radius:14px;padding:3px 10px;font-size:11.5px;cursor:pointer;${off ? 'text-decoration:line-through;' : ''}">
        <span style="width:12px;height:${s.total ? 4 : 3}px;border-radius:2px;background:${off ? '#cbd5e0' : s.color};display:inline-block"></span>${esc(s.name)}</button>`;
    };

    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-bottom:10px;font-size:12px;">
        <label>Directions :
          <select id="yc-mode" class="form-control" style="display:inline-block;width:auto;padding:2px 8px;font-size:12px;">
            <option value="estime" ${st.mode === 'estime' ? 'selected' : ''}>ROI estimé</option>
            <option value="confirme" ${st.mode === 'confirme' ? 'selected' : ''}>ROI confirmé (Production)</option>
          </select></label>
        <label>Couleurs :
          <select id="yc-pal" class="form-control" style="display:inline-block;width:auto;padding:2px 8px;font-size:12px;">
            ${Object.entries(PALETTES).map(([k, p]) => `<option value="${k}" ${st.palette === k ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select></label>
        <label style="cursor:pointer"><input type="checkbox" id="yc-cumul" ${st.cumul ? 'checked' : ''}> Cumulé</label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${totals.map(chip).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;">
        <span style="font-size:11px;color:#718096;font-weight:600;">Directions :</span>
        ${dirList.map(chip).join('')}
        <button type="button" id="yc-show" class="btn btn-ghost btn-sm" style="font-size:11px;">Tout afficher</button>
        <button type="button" id="yc-hide" class="btn btn-ghost btn-sm" style="font-size:11px;">Tout masquer</button>
      </div>
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;">
        ${grid}<line x1="${P.l}" y1="${P.t + chh}" x2="${W - P.r}" y2="${P.t + chh}" stroke="#cbd5e0"/>${xl}${body}
      </svg>
      <div class="text-muted" style="font-size:11px;margin-top:4px;">Un CU rattaché à plusieurs directions voit son ROI réparti à parts égales entre elles. Cliquez sur une pastille pour afficher / masquer la courbe.</div>`;

    el.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      st.hidden.has(k) ? st.hidden.delete(k) : st.hidden.add(k);
      draw();
    }));
    el.querySelector('#yc-mode').addEventListener('change', e => { st.mode = e.target.value; draw(); });
    el.querySelector('#yc-pal').addEventListener('change', e => { st.palette = e.target.value; draw(); });
    el.querySelector('#yc-cumul').addEventListener('change', e => { st.cumul = e.target.checked; draw(); });
    el.querySelector('#yc-show').addEventListener('click', () => { dirList.forEach(s => st.hidden.delete(s.key)); draw(); });
    el.querySelector('#yc-hide').addEventListener('click', () => { dirList.forEach(s => st.hidden.add(s.key)); draw(); });
  };
  draw();
}
