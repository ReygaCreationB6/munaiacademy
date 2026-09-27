// Shared export helpers — works entirely client-side.

export function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTxt(filename, text) {
    downloadBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

export function downloadMarkdown(filename, md) {
    downloadBlob(filename, new Blob([md], { type: 'text/markdown;charset=utf-8' }));
}

// .doc that Word opens natively. Not "true" DOCX but opens cleanly in Word/Docs.
export function downloadWord(filename, { title, bodyHtml }) {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body { font-family: 'Calibri', 'Georgia', serif; font-size: 11pt; line-height: 1.55; color:#111; margin: 40px; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 22px; color:#0f2547; }
  h3 { font-size: 11.5pt; margin-top: 16px; }
  p, li { font-size: 11pt; }
  .meta { color:#555; font-size: 10pt; margin-bottom: 18px; }
  pre { background:#f4f5f8; padding:10px; border-radius:4px; }
</style></head>
<body>${bodyHtml}</body></html>`;
    downloadBlob(filename, new Blob([html], { type: 'application/msword' }));
}

// Print-to-PDF via the browser. User picks "Save as PDF".
export function printPdf({ title, bodyHtml }) {
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body { font-family: 'Georgia', serif; font-size: 12pt; line-height: 1.6; color:#111; padding: 40px; }
  h1 { font-size: 17pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 22px; color:#0f2547; }
  h3 { font-size: 12pt; margin-top: 14px; }
  .meta { color:#555; font-size: 10.5pt; margin-bottom: 20px; }
  @media print { body { padding: 0; } }
</style></head>
<body>${bodyHtml}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
}

function escape(s = '') {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}