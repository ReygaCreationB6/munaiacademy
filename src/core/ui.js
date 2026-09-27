export function el(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html || '').trim();
    return t.content.firstElementChild;
}

export function escapeHtml(s = '') {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

export function toast(msg, ms = 2400) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el(`<div class="toast">${escapeHtml(msg)}</div>`);
    if (!t) return;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}

/* ------------------------------------------------------------------ */
/* Markdown-lite renderer                                             */
/*                                                                    */
/* Handles: headings h1-h4, horizontal rules, ordered & unordered     */
/* lists, task lists, bold, italic, inline code, fenced code blocks,  */
/* paragraphs. Strips decorative emojis that render as tofu boxes.    */
/* ------------------------------------------------------------------ */

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

function inlineFmt(s) {
    return s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>');
}

export function markdownLite(text = '') {
    if (!text) return '';

    // Strip emojis and variation selectors — they often render as tofu boxes.
    let s = String(text).replace(EMOJI_RE, '');

    // Escape HTML after emoji-strip.
    s = escapeHtml(s);

    // ---- Extract fenced code blocks ----
    const codeBlocks = [];
    s = s.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code) => {
        const id = `\u0001CB${codeBlocks.length}\u0001`;
        codeBlocks.push(`<pre><code>${code.replace(/\s+$/, '')}</code></pre>`);
        return id;
    });

    // ---- Extract inline code ----
    const inlineCodes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
        const id = `\u0001IC${inlineCodes.length}\u0001`;
        inlineCodes.push(`<code>${code}</code>`);
        return id;
    });

    // ---- Block-level processing ----
    const out = [];
    const blocks = s.split(/\n{2,}/);

    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        // Heading
        const h = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (h && !trimmed.includes('\n')) {
            const level = h[1].length;
            out.push(`<h${level}>${inlineFmt(h[2])}</h${level}>`);
            continue;
        }

        // Horizontal rule
        if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed) && !trimmed.includes('\n')) {
            out.push('<hr>');
            continue;
        }

        // List block (one or more list lines, possibly mixed)
        const lines = trimmed.split('\n');
        const listLike = lines.filter(l => l.trim() && /^\s*(?:[-*\u2022]|\d+\.)\s+/.test(l.trim()));
        if (listLike.length && listLike.length === lines.filter(l => l.trim()).length) {
            out.push(renderList(lines));
            continue;
        }

        // Paragraph (may span multiple lines)
        out.push(`<p>${inlineFmt(lines.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }

    let html = out.join('\n');

    // Restore code
    inlineCodes.forEach((code, i) => {
        html = html.replace(`\u0001IC${i}\u0001`, code);
    });
    codeBlocks.forEach((code, i) => {
        html = html.replace(`\u0001CB${i}\u0001`, code);
    });

    return html;
}

function renderList(lines) {
    const chunks = [];
    let currentType = null;
    let currentItems = [];

    const flush = () => {
        if (!currentItems.length) return;
        const tag = currentType === 'ol' ? 'ol' : 'ul';
        chunks.push(`<${tag}>${currentItems.join('')}</${tag}>`);
        currentItems = [];
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        // Ordered item
        const ol = line.match(/^(\d+)\.\s+(.+)$/);
        if (ol) {
            if (currentType !== 'ol') { flush(); currentType = 'ol'; }
            currentItems.push(`<li>${inlineFmt(ol[2])}</li>`);
            continue;
        }

        // Bullet or task item (accepts -, *, and • U+2022)
        const ul = line.match(/^[-*\u2022]\s+(.+)$/);
        if (ul) {
            if (currentType !== 'ul') { flush(); currentType = 'ul'; }
            const content = ul[1];

            // Task list
            const task = content.match(/^\[([ xX])\]\s*(.*)$/);
            if (task) {
                const done = task[1].toLowerCase() === 'x';
                currentItems.push(
                    `<li class="task${done ? ' done' : ''}">` +
                    `<span class="task-box" aria-hidden="true">${done ? '\u2713' : ''}</span>` +
                    `<span>${inlineFmt(task[2])}</span></li>`
                );
            } else {
                currentItems.push(`<li>${inlineFmt(content)}</li>`);
            }
            continue;
        }
    }
    flush();
    return chunks.join('');
}

/* ------------------------------------------------------------------ */
/* Modal — stack-aware, leak-free                                     */
/* ------------------------------------------------------------------ */

/* Modals can nest. Only the topmost one responds to Escape, and each
   modal removes its own listener on close (whether closed by X, by
   backdrop click, or by Escape). */
const modalStack = [];

export function openModal({ title, body, footer = '' }) {
    const backdrop = el(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="card-title">${escapeHtml(title)}</div>
          <button class="modal-close" aria-label="Close">\u00D7</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`);

    document.body.appendChild(backdrop);
    const entry = { backdrop };
    modalStack.push(entry);

    const close = () => {
        if (!backdrop.isConnected) return;
        backdrop.remove();
        const i = modalStack.indexOf(entry);
        if (i >= 0) modalStack.splice(i, 1);
        document.removeEventListener('keydown', onKey);
    };

    const onKey = (e) => {
        if (e.key !== 'Escape') return;
        // Only the topmost modal handles Escape.
        if (modalStack[modalStack.length - 1] !== entry) return;
        e.preventDefault();
        close();
    };

    const closeBtn = backdrop.querySelector('.modal-close');
    if (closeBtn) closeBtn.onclick = close;

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });

    document.addEventListener('keydown', onKey);

    return { close, root: backdrop };
}