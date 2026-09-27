import { store } from './store.js';
import { toast } from './ui.js';
import { computeSkills, computeStreak, SKILL_KEYS } from '../analytics/metrics.js';

/**
 * Opens a print-ready delegate dossier in a new window.
 * Contents: profile, conference, skills, position paper, resolution, recent sims.
 */
export function openDossier() {
  let w = null;
  try {
    w = window.open('', '_blank', 'width=900,height=1100');
  } catch (err) {
    console.error('[dossier] window.open failed:', err);
  }

  if (!w) {
    // Popup blocked. Tell the user what happened instead of doing nothing.
    try { toast('Popups are blocked. Allow popups for this site to generate the dossier.'); } catch { }
    return;
  }

  try {
    const s = store.get();
    const skills = computeSkills();
    const streak = computeStreak();
    const paper = (s.positionPapers || []).slice(-1)[0] || null;
    const resolution = (s.resolutions || []).slice(-1)[0] || null;
    const recentSims = (s.speeches || [])
      .filter(sp => sp && typeof sp.title === 'string' && sp.title.startsWith('Simulation'))
      .slice(-3)
      .reverse();

    w.document.write(html(s, skills, streak, paper, resolution, recentSims));
    w.document.close();
  } catch (err) {
    console.error('[dossier] write failed:', err);
    try { w.close(); } catch { }
    try { toast('Could not generate the dossier.'); } catch { }
    return;
  }

  // Wait for the popup to finish laying out, then trigger print.
  // Guard against the user closing it in the interim.
  setTimeout(() => {
    try {
      if (w.closed) return;
      w.focus();
      w.print();
    } catch (err) {
      // Firefox throws on cross-document property access once the popup is closed.
      console.debug('[dossier] print skipped:', err && err.message);
    }
  }, 400);
}

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function para(t) {
  const e = esc(t == null ? '' : t);
  return e.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function html(s, skills, streak, paper, resolution, recentSims) {
  const conf = s.conference || {};
  const profile = s.profile || {};
  const overall = Math.round(
    SKILL_KEYS.reduce((n, k) => n + (Number(skills[k]) || 0), 0) / SKILL_KEYS.length
  );
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Delegate Dossier — ${esc(conf.country || 'Delegate')}</title>
<style>
  @page { margin: 18mm; }
  body {
    font-family: Georgia, 'Source Serif 4', serif;
    font-size: 11.5pt;
    line-height: 1.55;
    color: #0e1524;
    margin: 0;
    padding: 0;
  }
  h1 { font-size: 22pt; margin: 0 0 4px; color: #0a1a33; }
  h2 { font-size: 13.5pt; margin: 22px 0 8px; color: #0f2547; border-bottom: 1px solid #e3e7ee; padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 14px 0 4px; color: #17325c; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 18px; }
  .meta b { color: #0f2547; }
  .badge { display: inline-block; background: #f4f5f8; border: 1px solid #e3e7ee; padding: 2px 8px; border-radius: 10px; font-size: 9.5pt; margin-right: 4px; color: #5a6478; }
  .skill-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 10.5pt; }
  .skill-label { width: 130px; color: #2a3446; }
  .skill-bar { flex: 1; height: 7px; background: #e3e7ee; border-radius: 4px; overflow: hidden; }
  .skill-bar > div { height: 100%; background: #17325c; }
  .skill-val { width: 30px; text-align: right; color: #5a6478; font-variant-numeric: tabular-nums; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .box { border: 1px solid #e3e7ee; padding: 12px; border-radius: 6px; }
  .small { font-size: 9.5pt; color: #5a6478; }
  .pre { font-style: italic; margin: 3px 0; }
  .op { margin: 6px 0; }
  ul { padding-left: 20px; margin: 4px 0; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 40px; border-top: 1px solid #e3e7ee; padding-top: 10px; font-size: 9pt; color: #98a1b3; text-align: center; }
</style>
</head>
<body>
  <h1>Delegate Dossier</h1>
  <div class="meta">
    <b>${esc(profile.name || 'Delegate')}</b> · ${esc(conf.country || '—')} · ${esc(conf.committee || '—')}<br>
    Topic: ${esc(conf.topic || '—')}<br>
    Generated ${esc(today)} · ${Number(streak.current) || 0}-day streak · ${Number(s.xp) || 0} XP
  </div>

  <h2>Skill Profile</h2>
  <p class="small">
    Overall: <b>${overall}</b> / 100 ·
    ${(s.speeches || []).length} speeches ·
    ${(s.positionPapers || []).length} papers ·
    ${(s.resolutions || []).length} resolutions
  </p>
  ${SKILL_KEYS.map(k => {
    const v = Math.max(0, Math.min(100, Number(skills[k]) || 0));
    return `
    <div class="skill-row">
      <span class="skill-label">${esc(k)}</span>
      <span class="skill-bar"><div style="width:${v}%"></div></span>
      <span class="skill-val">${v}</span>
    </div>`;
  }).join('')}

  ${paper ? `
    <h2 class="page-break">Position Paper</h2>
    <p class="small"><b>${esc(paper.committee)}</b> · ${esc(paper.country)} · ${esc(paper.topic)}</p>
    <h3>I. Background / Context</h3>${para(paper.background)}
    <h3>II. Country Position</h3>${para(paper.position)}
    <h3>III. Previous International Action</h3>${para(paper.previousAction)}
    <h3>IV. Proposed Solutions</h3>${para(paper.solutions)}
  ` : `<h2>Position Paper</h2><p class="small">No position paper saved yet.</p>`}

  ${resolution ? `
    <h2 class="page-break">Draft Resolution</h2>
    <p class="small"><b>${esc(resolution.committee)}</b> · ${esc(resolution.topic)}</p>
    <p class="small"><b>Sponsors:</b> ${esc(resolution.sponsors || '—')} · <b>Signatories:</b> ${esc(resolution.signatories || '—')}</p>
    <p><i>The ${esc(resolution.committee)},</i></p>
    ${(resolution.preamble || []).map(c => `<div class="pre">${esc(c && c.text)}</div>`).join('')}
    ${(resolution.operative || []).map((c, i) => `<div class="op"><b>${i + 1}.</b> ${esc(c && c.text)}</div>`).join('')}
  ` : `<h2>Draft Resolution</h2><p class="small">No resolution saved yet.</p>`}

  ${recentSims.length ? `
    <h2 class="page-break">Recent Simulations</h2>
    <ul>
      ${recentSims.map(sim => `<li><b>${esc(sim.title)}</b> — <span class="small">${esc(sim.text || '')}</span></li>`).join('')}
    </ul>` : ''}

  <div class="footer">Generated by MUN AI Academy · For training purposes only. Verify all cited facts before a real conference.</div>
</body>
</html>`;
}