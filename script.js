/* ============================================================
   BirthdayWishes for Putri Karina
   Shared client-side logic for every page.
   ------------------------------------------------------------
   STORAGE: Supabase only.

   Messages, media metadata and the visit counter all live in
   Supabase (Postgres + Storage), so every visitor sees the same
   wishes and gallery from any device. There is no local
   fallback — if the backend is not configured, the site says so
   instead of silently showing private demo data.

   Supabase is called over plain `fetch` against its REST and
   Storage APIs — no SDK, no build step, no dependencies.
   See README.md and supabase-schema.sql for setup.

   All user-supplied text is rendered via textContent to avoid XSS.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Configuration
   ------------------------------------------------------------ */
const CONFIG = {
    name: 'Putri Karina',
    // Countdown target: the next occurrence of this month/day.
    birthday: { month: 9, day: 11 } // 11 September
};

/* ------------------------------------------------------------
   REQUIRED: your Supabase project details.

   Supabase dashboard -> Settings -> API:
     supabaseUrl     = "Project URL"
     supabaseAnonKey = "anon public" key

   Use the anon key, NOT the service_role key — the anon key is
   public by design and is constrained by the Row Level Security
   policies in supabase-schema.sql.
   ------------------------------------------------------------ */
const BACKEND = {
    supabaseUrl: '',      // e.g. 'https://abcdefghijkl.supabase.co'
    supabaseAnonKey: '',  // the public "anon" key
    messagesTable: 'messages',
    mediaTable: 'media',
    mediaBucket: 'birthday-media',
    visitsTable: 'visits'
};

function backendEnabled() {
    return Boolean(BACKEND.supabaseUrl && BACKEND.supabaseAnonKey);
}

const CONFIG_ERROR =
    'Backend not configured. Set BACKEND.supabaseUrl and BACKEND.supabaseAnonKey at the top of script.js.';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const MAX_FILES_PER_UPLOAD = 10;

/* ------------------------------------------------------------
   Tiny DOM helpers
   ------------------------------------------------------------ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ------------------------------------------------------------
   Toast notifications
   ------------------------------------------------------------ */
const TOAST_ICONS = { success: '✅', error: '⚠️', info: '💡' };

function showToast(message, type = 'info', duration = 3600) {
    const container = $('#toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;

    const text = document.createElement('span');
    text.textContent = message; // textContent => no HTML injection

    toast.append(icon, text);
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

/* ------------------------------------------------------------
   Ambient background (orbs, floating hearts, sparkles)
   ------------------------------------------------------------ */
function initAmbientBackground() {
    const orbsHost = $('#gradientOrbs');
    if (orbsHost && !orbsHost.childElementCount) {
        for (let i = 1; i <= 4; i++) {
            const orb = document.createElement('div');
            orb.className = `orb orb-${i}`;
            orbsHost.appendChild(orb);
        }
    }

    const heartsHost = $('#floatingHearts');
    if (heartsHost && !heartsHost.childElementCount) {
        const glyphs = ['💖', '🌸', '✨', '💕', '🎈', '💗', '🌟'];
        const count = window.innerWidth < 700 ? 8 : 16;

        for (let i = 0; i < count; i++) {
            const heart = document.createElement('span');
            heart.className = 'float-heart';
            heart.setAttribute('aria-hidden', 'true');
            heart.textContent = glyphs[i % glyphs.length];
            heart.style.left = `${Math.random() * 100}%`;
            heart.style.fontSize = `${12 + Math.random() * 14}px`;
            heart.style.animationDuration = `${12 + Math.random() * 14}s`;
            heart.style.animationDelay = `${Math.random() * 12}s`;
            heartsHost.appendChild(heart);
        }
    }

    const sparkHost = $('#sparkles');
    if (sparkHost && !sparkHost.childElementCount) {
        const count = window.innerWidth < 700 ? 14 : 28;

        for (let i = 0; i < count; i++) {
            const dot = document.createElement('span');
            dot.className = 'sparkle';
            dot.setAttribute('aria-hidden', 'true');
            dot.style.left = `${Math.random() * 100}%`;
            dot.style.top = `${Math.random() * 100}%`;
            dot.style.animationDuration = `${2 + Math.random() * 3.5}s`;
            dot.style.animationDelay = `${Math.random() * 4}s`;
            sparkHost.appendChild(dot);
        }
    }
}

/* ------------------------------------------------------------
   Navigation
   ------------------------------------------------------------ */
function initNavigation() {
    const nav = $('.main-nav');
    const toggle = $('.nav-toggle');
    const menu = $('#nav-menu');

    if (nav) {
        const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    if (!toggle || !menu) return;

    const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        menu.classList.toggle('open', open);
    };

    toggle.addEventListener('click', () => {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', (e) => {
        if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 860) setOpen(false);
    });
}

/* ------------------------------------------------------------
   Countdown to the next birthday
   ------------------------------------------------------------ */
function initCountdown() {
    const daysEl = $('#days');
    if (!daysEl) return;

    const hoursEl = $('#hours');
    const minutesEl = $('#minutes');
    const secondsEl = $('#seconds');

    // Compute target: the next occurrence of month/day at 00:00 local time.
    const today = new Date();
    let target = new Date(today.getFullYear(), CONFIG.birthday.month - 1, CONFIG.birthday.day, 0, 0, 0);
    if (target.getTime() < today.getTime()) {
        target = new Date(today.getFullYear() + 1, CONFIG.birthday.month - 1, CONFIG.birthday.day, 0, 0, 0);
    }

    const pad = (n) => String(n).padStart(2, '0');

    function tick() {
        const diff = target.getTime() - Date.now();

        if (diff <= 0) {
            daysEl.textContent = hoursEl.textContent = minutesEl.textContent = secondsEl.textContent = '00';
            return;
        }

        const totalSeconds = Math.floor(diff / 1000);
        daysEl.textContent = pad(Math.floor(totalSeconds / 86400));
        hoursEl.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
        minutesEl.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
        secondsEl.textContent = pad(totalSeconds % 60);
    }

    tick();
    setInterval(tick, 1000);
}

/* ------------------------------------------------------------
   Supabase REST helper
   ------------------------------------------------------------ */
async function supabaseFetch(path, options = {}) {
    const base = BACKEND.supabaseUrl.replace(/\/$/, '');
    const headers = Object.assign({
        apikey: BACKEND.supabaseAnonKey,
        Authorization: `Bearer ${BACKEND.supabaseAnonKey}`
    }, options.headers || {});

    let response;
    try {
        response = await fetch(base + path, Object.assign({}, options, { headers }));
    } catch {
        throw new Error('Network error — the server could not be reached.');
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Server responded ${response.status}. ${detail.slice(0, 160)}`);
    }

    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
}

function makeId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const RELATION_LABELS = {
    friend: '👯 Friend',
    family: '👨‍👩‍👧 Family',
    colleague: '💼 Colleague',
    other: '✨ Other'
};

/* ------------------------------------------------------------
   Messages
   ------------------------------------------------------------ */
function rowToMessage(row) {
    return {
        id: row.id,
        name: row.name,
        relation: row.relation || 'other',
        text: row.body,
        color: row.color || 'pink',
        date: row.created_at || new Date().toISOString()
    };
}

async function loadMessages() {
    if (!backendEnabled()) return [];

    try {
        const rows = await supabaseFetch(
            `/rest/v1/${BACKEND.messagesTable}?select=*&order=created_at.desc`,
            { headers: { Accept: 'application/json' } }
        );
        return (rows || []).map(rowToMessage);
    } catch (err) {
        console.error('[messages] load failed:', err);
        showToast('Could not load messages from the server.', 'error');
        return [];
    }
}

async function addMessage(msg) {
    if (!backendEnabled()) {
        showToast(CONFIG_ERROR, 'error', 6000);
        return null;
    }

    try {
        const rows = await supabaseFetch(`/rest/v1/${BACKEND.messagesTable}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                name: msg.name,
                relation: msg.relation,
                body: msg.text,
                color: msg.color
            })
        });
        return rows && rows[0] ? rowToMessage(rows[0]) : msg;
    } catch (err) {
        console.error('[messages] add failed:', err);
        showToast('Could not send your wish. Please try again.', 'error');
        return null;
    }
}

async function removeMessage(id) {
    if (!backendEnabled()) return false;

    try {
        await supabaseFetch(
            `/rest/v1/${BACKEND.messagesTable}?id=eq.${encodeURIComponent(id)}`,
            { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
        );
        return true;
    } catch (err) {
        console.error('[messages] delete failed:', err);
        showToast('Could not delete the message.', 'error');
        return false;
    }
}

/**
 * Build a message card.
 * Uses an <article> (not a button) so the delete button and the
 * "read full message" button are never nested inside another
 * interactive element — valid, keyboard- and screen-reader-friendly.
 */
function createMessageCard(msg, index) {
    const card = document.createElement('article');
    card.className = `message-card color-${msg.color || 'pink'}`;
    card.style.animationDelay = `${Math.min(index * 70, 600)}ms`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'message-delete';
    del.setAttribute('aria-label', `Delete message from ${msg.name}`);
    del.textContent = '×';
    del.addEventListener('click', () => {
        if (confirm(`Delete the message from ${msg.name}?`)) deleteMessage(msg.id);
    });

    const relation = document.createElement('span');
    relation.className = 'message-relation';
    relation.textContent = RELATION_LABELS[msg.relation] || RELATION_LABELS.other;

    const text = document.createElement('p');
    text.className = 'message-text';
    text.textContent = msg.text;

    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = msg.name;

    const date = document.createElement('span');
    date.className = 'message-date';
    date.textContent = formatDate(msg.date);

    footer.append(author, date);

    const readMore = document.createElement('button');
    readMore.type = 'button';
    readMore.className = 'message-read-more';
    readMore.textContent = 'Read full message';
    readMore.addEventListener('click', () => openMessageModal(msg));

    card.append(del, relation, text, footer, readMore);
    return card;
}

async function renderMessages() {
    const grid = $('#messagesGrid');
    if (!grid) return;

    grid.setAttribute('aria-busy', 'true');
    const messages = (await loadMessages()).sort((a, b) => new Date(b.date) - new Date(a.date));
    grid.setAttribute('aria-busy', 'false');
    grid.replaceChildren();

    const empty = $('#emptyState');
    if (messages.length === 0) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    messages.forEach((msg, i) => grid.appendChild(createMessageCard(msg, i)));
}

async function deleteMessage(id) {
    const ok = await removeMessage(id);
    if (!ok) return;
    await renderMessages();
    await updateThankYouStats();
    showToast('Message removed.', 'info');
}

function initMessageForm() {
    const form = $('#messageForm');
    const toggle = $('#addMessageToggle');
    const cancel = $('#cancelMessage');
    const firstBtn = $('#firstMessageBtn');

    const setFormOpen = (open) => {
        if (!form || !toggle) return;
        form.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) $('#msgName')?.focus();
    };

    toggle?.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        setFormOpen(!isOpen);
    });
    cancel?.addEventListener('click', () => setFormOpen(false));
    firstBtn?.addEventListener('click', () => {
        setFormOpen(true);
        form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = $('#msgName').value.trim();
        const text = $('#msgText').value.trim();
        const relation = $('#msgRelation').value;
        const color = form.querySelector('input[name="msgColor"]:checked')?.value || 'pink';
        const status = $('#msgFormStatus');
        const submit = form.querySelector('button[type="submit"]');

        if (!name || !text) {
            if (status) {
                status.textContent = 'Please fill in both your name and your message.';
                status.className = 'form-status error';
            }
            (!name ? $('#msgName') : $('#msgText'))?.focus();
            return;
        }

        if (submit) submit.disabled = true;
        if (status) {
            status.textContent = 'Sending…';
            status.className = 'form-status';
        }

        const saved = await addMessage({
            id: makeId(),
            name: name.slice(0, 60),
            relation,
            text: text.slice(0, 1200),
            color,
            date: new Date().toISOString()
        });

        if (submit) submit.disabled = false;

        if (!saved) {
            if (status) {
                status.textContent = 'Your wish could not be sent. Please try again.';
                status.className = 'form-status error';
            }
            return;
        }

        form.reset();
        if (status) {
            status.textContent = '';
            status.className = 'form-status';
        }
        setFormOpen(false);
        await renderMessages();
        await updateThankYouStats();
        showToast(`Thank you, ${name}! Your wish was added. 💌`, 'success');
    });
}

/* Message modal (uses native <dialog>) */
function initMessageModal() {
    const modal = $('#messageModal');
    if (!modal) return;

    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.close());
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => modal.close());
}

function openMessageModal(msg) {
    const modal = $('#messageModal');
    const host = $('#modalMessage');
    if (!modal || !host) return;

    const relation = document.createElement('span');
    relation.className = 'message-relation';
    relation.textContent = RELATION_LABELS[msg.relation] || RELATION_LABELS.other;

    const text = document.createElement('p');
    text.className = 'message-text';
    text.textContent = msg.text;

    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = msg.name;

    const date = document.createElement('span');
    date.className = 'message-date';
    date.textContent = formatDate(msg.date);

    footer.append(author, date);
    host.replaceChildren(relation, text, footer);
    modal.showModal();
}

/* Quick wish form on the homepage */
function initQuickMessageForm() {
    const form = $('#quickMessageForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = $('#senderName').value.trim();
        const text = $('#senderMessage').value.trim();
        const status = $('#formStatus');
        const submit = form.querySelector('button[type="submit"]');

        if (!name || !text) {
            if (status) {
                status.textContent = 'Please fill in your name and message.';
                status.className = 'form-status error';
            }
            return;
        }

        if (submit) submit.disabled = true;
        if (status) {
            status.textContent = 'Sending…';
            status.className = 'form-status';
        }

        const saved = await addMessage({
            id: makeId(),
            name: name.slice(0, 60),
            relation: 'friend',
            text: text.slice(0, 1200),
            color: 'pink',
            date: new Date().toISOString()
        });

        if (submit) submit.disabled = false;

        if (!saved) {
            if (status) {
                status.textContent = 'Your wish could not be sent. Please try again.';
                status.className = 'form-status error';
            }
            return;
        }

        form.reset();
        if (status) {
            status.textContent = `Thank you, ${name}! Your wish is saved in Messages.`;
            status.className = 'form-status success';
        }
        showToast('Your birthday wish was saved. 💌', 'success');
    });
}

/* ------------------------------------------------------------
   Media  (Supabase Storage + `media` metadata table)
   ------------------------------------------------------------ */
function publicUrlFor(storagePath) {
    const base = BACKEND.supabaseUrl.replace(/\/$/, '');
    return `${base}/storage/v1/object/public/${BACKEND.mediaBucket}/${storagePath}`;
}

function safeFileName(name) {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned.slice(-60) || 'file';
}

async function uploadToStorage(file, storagePath) {
    const base = BACKEND.supabaseUrl.replace(/\/$/, '');
    const response = await fetch(
        `${base}/storage/v1/object/${BACKEND.mediaBucket}/${storagePath}`,
        {
            method: 'POST',
            headers: {
                apikey: BACKEND.supabaseAnonKey,
                Authorization: `Bearer ${BACKEND.supabaseAnonKey}`,
                'Content-Type': file.type || 'application/octet-stream',
                'x-upsert': 'false'
            },
            body: file
        }
    );

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Upload failed (${response.status}). ${detail.slice(0, 160)}`);
    }
}

async function deleteFromStorage(storagePath) {
    if (!storagePath) return;
    const base = BACKEND.supabaseUrl.replace(/\/$/, '');
    await fetch(
        `${base}/storage/v1/object/${BACKEND.mediaBucket}/${storagePath}`,
        {
            method: 'DELETE',
            headers: {
                apikey: BACKEND.supabaseAnonKey,
                Authorization: `Bearer ${BACKEND.supabaseAnonKey}`
            }
        }
    ).catch(() => { /* best effort — the row is already gone */ });
}

function rowToMedia(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        mime: row.mime,
        size: row.size,
        caption: row.caption || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        date: row.created_at || new Date().toISOString(),
        storagePath: row.storage_path,
        remoteUrl: publicUrlFor(row.storage_path)
    };
}

async function listMedia() {
    if (!backendEnabled()) return [];

    try {
        const rows = await supabaseFetch(
            `/rest/v1/${BACKEND.mediaTable}?select=*&order=created_at.desc`,
            { headers: { Accept: 'application/json' } }
        );
        return (rows || []).map(rowToMedia);
    } catch (err) {
        console.error('[media] load failed:', err);
        showToast('Could not load the gallery from the server.', 'error');
        return [];
    }
}

async function addMedia(file, meta) {
    if (!backendEnabled()) throw new Error(CONFIG_ERROR);

    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const storagePath = `${makeId()}-${safeFileName(file.name)}`;

    await uploadToStorage(file, storagePath);

    const rows = await supabaseFetch(`/rest/v1/${BACKEND.mediaTable}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation'
        },
        body: JSON.stringify({
            name: file.name,
            type,
            mime: file.type,
            size: file.size,
            caption: meta.caption,
            tags: meta.tags,
            storage_path: storagePath
        })
    });

    return rows && rows[0] ? rowToMedia(rows[0]) : null;
}

async function removeMedia(record) {
    if (!backendEnabled()) return;

    await supabaseFetch(
        `/rest/v1/${BACKEND.mediaTable}?id=eq.${encodeURIComponent(record.id)}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
    );
    await deleteFromStorage(record.storagePath);
}

/* ------------------------------------------------------------
   Gallery
   ------------------------------------------------------------ */
function urlFor(record) {
    return record.remoteUrl;
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let galleryItems = [];
let galleryFilter = 'all';

function createGalleryItem(record, index) {
    const item = document.createElement('figure');
    item.className = 'gallery-item';
    item.style.animationDelay = `${Math.min(index * 60, 500)}ms`;

    const media = record.type === 'video'
        ? Object.assign(document.createElement('video'), {
            src: urlFor(record), muted: true, playsInline: true, preload: 'metadata'
        })
        : Object.assign(document.createElement('img'), {
            src: urlFor(record), alt: record.caption || record.name, loading: 'lazy'
        });

    const overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';

    if (record.caption) {
        const caption = document.createElement('p');
        caption.className = 'gallery-caption';
        caption.textContent = record.caption;
        overlay.appendChild(caption);
    }

    if (record.tags?.length) {
        const tags = document.createElement('div');
        tags.className = 'gallery-tags';
        record.tags.slice(0, 4).forEach((tag) => {
            const chip = document.createElement('span');
            chip.className = 'gallery-tag';
            chip.textContent = `#${tag}`;
            tags.appendChild(chip);
        });
        overlay.appendChild(tags);
    }

    // Sibling buttons (never nested) — one opens, one deletes.
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'gallery-open';
    open.setAttribute('aria-label', `Open ${record.type}: ${record.caption || record.name}`);
    open.appendChild(overlay);
    open.addEventListener('click', () => openLightbox(record.id));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'gallery-delete';
    del.setAttribute('aria-label', `Delete ${record.name}`);
    del.textContent = '×';
    del.addEventListener('click', async () => {
        if (!confirm(`Delete "${record.caption || record.name}"?`)) return;

        del.disabled = true;
        try {
            await removeMedia(record);
            galleryItems = galleryItems.filter((r) => r.id !== record.id);
            renderGallery();
            await updateThankYouStats();
            showToast('Memory deleted.', 'info');
        } catch {
            del.disabled = false;
            showToast('Could not delete this item.', 'error');
        }
    });

    item.append(media, open);

    if (record.type === 'video') {
        const badge = document.createElement('span');
        badge.className = 'gallery-video-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = '▶ Video';
        item.appendChild(badge);
    }

    item.append(del);
    return item;
}

function renderGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;

    const visible = galleryFilter === 'all'
        ? galleryItems
        : galleryItems.filter((r) => r.type === galleryFilter);

    grid.replaceChildren();
    visible
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach((record, i) => grid.appendChild(createGalleryItem(record, i)));

    const empty = $('#galleryEmptyState');
    if (empty) {
        // Only show the "no memories" prompt when there is truly nothing at all.
        const showEmpty = galleryItems.length === 0;
        empty.classList.toggle('hidden', !showEmpty);
        const heading = empty.querySelector('h3');
        const para = empty.querySelector('p');
        if (showEmpty && heading && para) {
            heading.textContent = 'No Memories Yet';
            para.textContent = 'Upload the first photo or video to start the gallery!';
        }
    }

    if (visible.length === 0 && galleryItems.length > 0) {
        const note = document.createElement('p');
        note.className = 'form-status';
        note.style.gridColumn = '1 / -1';
        note.style.textAlign = 'center';
        note.textContent = `No ${galleryFilter === 'video' ? 'videos' : 'photos'} uploaded yet.`;
        grid.appendChild(note);
    }
}

async function loadGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;

    grid.setAttribute('aria-busy', 'true');
    galleryItems = await listMedia();
    grid.setAttribute('aria-busy', 'false');
    renderGallery();
    await updateThankYouStats();
}

function initGalleryFilter() {
    const buttons = $$('.filter-btn');
    if (!buttons.length) return;

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            galleryFilter = btn.dataset.filter;
            buttons.forEach((b) => {
                const active = b === btn;
                b.classList.toggle('active', active);
                b.setAttribute('aria-pressed', String(active));
            });
            renderGallery();
        });
    });
}

/* --------- Upload form --------- */
let pendingFiles = [];

function initUpload() {
    const form = $('#uploadForm');
    if (!form) return;

    const toggle = $('#uploadToggle');
    const cancel = $('#cancelUpload');
    const firstBtn = $('#firstUploadBtn');
    const dropZone = $('#dropZone');
    const input = $('#mediaFiles');
    const preview = $('#filePreview');
    const submitBtn = $('#uploadSubmit');

    const setFormOpen = (open) => {
        form.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) dropZone?.focus();
    };

    toggle.addEventListener('click', () => {
        setFormOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    cancel.addEventListener('click', () => {
        pendingFiles = [];
        renderFilePreview();
        setFormOpen(false);
    });
    firstBtn?.addEventListener('click', () => {
        setFormOpen(true);
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // Click / keyboard on the drop zone opens the file picker.
    dropZone.addEventListener('click', (e) => {
        if (!e.target.closest('.file-remove')) input.click();
    });
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });

    input.addEventListener('change', () => {
        addFiles(Array.from(input.files || []));
        input.value = '';
    });

    ['dragenter', 'dragover'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        addFiles(Array.from(e.dataTransfer?.files || []));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        uploadPendingFiles();
    });

    function addFiles(files) {
        const status = $('#uploadStatus');
        status.textContent = '';
        status.className = 'form-status';

        for (const file of files) {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');

            if (!isImage && !isVideo) {
                showToast(`"${file.name}" is not an image or video.`, 'error');
                continue;
            }
            if (file.size > MAX_FILE_BYTES) {
                showToast(`"${file.name}" is larger than 50 MB.`, 'error');
                continue;
            }
            if (pendingFiles.length >= MAX_FILES_PER_UPLOAD) {
                showToast(`Up to ${MAX_FILES_PER_UPLOAD} files per upload.`, 'info');
                break;
            }
            pendingFiles.push(file);
        }
        renderFilePreview();
    }

    function renderFilePreview() {
        preview.replaceChildren();

        pendingFiles.forEach((file, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'file-preview-item';

            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.alt = file.name;
                img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
                wrap.appendChild(img);
            } else {
                const icon = document.createElement('span');
                icon.className = 'file-type-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = '🎬';
                wrap.appendChild(icon);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'file-remove';
            remove.setAttribute('aria-label', `Remove ${file.name}`);
            remove.textContent = '×';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingFiles.splice(index, 1);
                renderFilePreview();
            });

            wrap.appendChild(remove);
            wrap.title = `${file.name} — ${humanSize(file.size)}`;
            preview.appendChild(wrap);
        });

        if (submitBtn) submitBtn.disabled = pendingFiles.length === 0;
    }

    async function uploadPendingFiles() {
        const status = $('#uploadStatus');
        const caption = $('#mediaCaption').value.trim().slice(0, 200);
        const tags = $('#mediaTags').value
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 8);

        if (pendingFiles.length === 0) {
            status.textContent = 'Please choose at least one photo or video.';
            status.className = 'form-status error';
            return;
        }

        if (!backendEnabled()) {
            status.textContent = CONFIG_ERROR;
            status.className = 'form-status error';
            showToast(CONFIG_ERROR, 'error', 6000);
            return;
        }

        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').classList.add('hidden');
        submitBtn.querySelector('.btn-loading').classList.remove('hidden');

        const progressWrap = $('#uploadProgress');
        const bar = $('#progressBar');
        const progressText = $('#progressText');
        progressWrap.classList.remove('hidden');

        const files = pendingFiles.slice();
        const statusMessages = ['Uploading…', 'Saving details…', 'Almost done…'];
        let stored = 0;
        let failed = 0;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                status.textContent = statusMessages[Math.min(i, statusMessages.length - 1)];
                status.className = 'form-status';

                try {
                    const saved = await addMedia(file, { caption, tags });
                    if (saved) stored++; else failed++;
                } catch (err) {
                    console.error('[upload] failed:', err);
                    failed++;
                }

                const pct = Math.round(((i + 1) / files.length) * 100);
                bar.style.width = `${pct}%`;
                progressText.textContent = `${pct}%`;
                progressWrap.setAttribute('aria-valuenow', String(pct));
                await new Promise((r) => setTimeout(r, 120)); // let the bar be visible
            }

            if (stored > 0) {
                showToast(`${stored} ${stored === 1 ? 'memory' : 'memories'} added. 📸`, 'success');
            }
            if (failed > 0) {
                showToast(`${failed} file${failed === 1 ? '' : 's'} could not be uploaded.`, 'error');
            }

            status.textContent = stored > 0
                ? `Successfully uploaded ${stored} ${stored === 1 ? 'file' : 'files'}.`
                : 'Nothing was uploaded.';
            status.className = stored > 0 ? 'form-status success' : 'form-status error';

            pendingFiles = [];
            form.reset();
            renderFilePreview();
            await loadGallery();
        } finally {
            renderFilePreview(); // re-enables the button only if files remain
            submitBtn.querySelector('.btn-text').classList.remove('hidden');
            submitBtn.querySelector('.btn-loading').classList.add('hidden');
            setTimeout(() => {
                progressWrap.classList.add('hidden');
                bar.style.width = '0%';
                progressText.textContent = '0%';
            }, 1200);
        }
    }

    renderFilePreview();
}

/* --------- Lightbox --------- */
let lightboxIndex = 0;

function lightboxList() {
    return galleryItems
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .filter((r) => galleryFilter === 'all' || r.type === galleryFilter);
}

function openLightbox(id) {
    const modal = $('#lightboxModal');
    if (!modal) return;

    const list = lightboxList();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return;

    lightboxIndex = idx;
    paintLightbox();
    modal.showModal();
}

function paintLightbox() {
    const list = lightboxList();
    const record = list[lightboxIndex];
    if (!record) return;

    const mediaHost = $('#lightboxMedia');
    const title = $('#lightboxTitle');
    const caption = $('#lightboxCaption') || $('#lightboxDesc');
    const meta = $('#lightboxMeta');

    if (record.type === 'video') {
        const video = document.createElement('video');
        video.src = urlFor(record);
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        mediaHost.replaceChildren(video);
    } else {
        const img = document.createElement('img');
        img.src = urlFor(record);
        img.alt = record.caption || record.name;
        mediaHost.replaceChildren(img);
    }

    title.textContent = record.name;
    if (caption) caption.textContent = record.caption || 'A precious memory.';

    meta.replaceChildren();
    record.tags?.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'lightbox-tag';
        chip.textContent = `#${tag}`;
        meta.appendChild(chip);
    });

    const when = document.createElement('span');
    when.textContent = `${formatDate(record.date)} · ${humanSize(record.size)}`;
    meta.appendChild(when);

    const hasMultiple = list.length > 1;
    $('.lightbox-prev')?.toggleAttribute('hidden', !hasMultiple);
    $('.lightbox-next')?.toggleAttribute('hidden', !hasMultiple);
}

function stepLightbox(delta) {
    const list = lightboxList();
    if (list.length === 0) return;
    lightboxIndex = (lightboxIndex + delta + list.length) % list.length;
    paintLightbox();
}

function initLightbox() {
    const modal = $('#lightboxModal');
    if (!modal) return;

    modal.querySelector('.lightbox-close')?.addEventListener('click', () => modal.close());
    modal.querySelector('.lightbox-backdrop')?.addEventListener('click', () => modal.close());
    $('.lightbox-prev')?.addEventListener('click', () => stepLightbox(-1));
    $('.lightbox-next')?.addEventListener('click', () => stepLightbox(1));

    // Stop background video when closing.
    modal.addEventListener('close', () => {
        const video = modal.querySelector('video');
        video?.pause();
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.open) return;
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
    });
}

/* ------------------------------------------------------------
   Thank-you page: stats, counters, confetti, share
   ------------------------------------------------------------ */
let visitorCount = 1;

async function readVisitorCount() {
    if (!backendEnabled()) return 1;

    try {
        const rows = await supabaseFetch(
            `/rest/v1/${BACKEND.visitsTable}?select=count&id=eq.1`,
            { headers: { Accept: 'application/json' } }
        );
        const value = rows && rows[0] ? Number(rows[0].count) : NaN;
        if (Number.isFinite(value) && value > 0) return value;
    } catch (err) {
        console.error('[visits] read failed:', err);
    }
    return 1;
}

/**
 * Increment the shared visit counter via the `increment_visits()`
 * SQL function (see supabase-schema.sql). There is no update policy
 * on the table, so that function is the only way to change it.
 */
async function bumpVisitorCount() {
    if (!backendEnabled()) return 1;

    try {
        const total = await supabaseFetch('/rest/v1/rpc/increment_visits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        const parsed = Number(total);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch (err) {
        console.error('[visits] increment failed:', err);
    }
    return readVisitorCount();
}

async function initVisitorCount() {
    // Only the page that displays the figure needs to count a visit.
    if (!$('#statsSummary')) return;
    visitorCount = await bumpVisitorCount();
}

function countUp(el, target) {
    if (!el) return;
    const start = performance.now();
    const duration = 1100;

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
        el.textContent = String(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

async function updateThankYouStats() {
    const host = $('#statsSummary');
    if (!host) return;

    const messages = await loadMessages();
    const data = [
        ['#statMessages', messages.length],
        ['#statPhotos', galleryItems.filter((r) => r.type === 'image').length],
        ['#statVideos', galleryItems.filter((r) => r.type === 'video').length],
        ['#statVisitors', visitorCount]
    ];

    data.forEach(([sel, value]) => {
        const el = $(sel);
        if (el) el.dataset.target = String(value);
    });
}

function initStatsCounters() {
    const host = $('#statsSummary');
    if (!host) return;

    const els = $$('.stat-number', host);

    // Animate each counter the first time it scrolls into view.
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            countUp(el, parseInt(el.dataset.target, 10) || 0);
            obs.unobserve(el);
        });
    }, { threshold: 0.4 });

    els.forEach((el) => observer.observe(el));
}

function initConfetti() {
    const host = $('#confettiContainer');
    if (!host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const colors = ['#f8bbd0', '#d1d5f0', '#bfe8e4', '#ffe4c2', '#ec7fa9', '#b3b9e3'];
    const count = window.innerWidth < 700 ? 30 : 60;

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.setAttribute('aria-hidden', 'true');
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        piece.style.animationDuration = `${3 + Math.random() * 3}s`;
        piece.style.animationDelay = `${Math.random() * 2.5}s`;
        piece.style.width = `${6 + Math.random() * 7}px`;
        piece.style.height = `${9 + Math.random() * 9}px`;
        host.appendChild(piece);
    }
}

function initShare() {
    const buttons = $$('.share-btn');
    if (!buttons.length) return;

    const url = window.location.href.split('#')[0].replace(/thank-you\.html.*$/, 'index.html') || window.location.href;
    const text = `Happy Birthday ${CONFIG.name}! 🎂 Come celebrate and leave a birthday wish:`;

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const platform = btn.dataset.platform;
            const encodedUrl = encodeURIComponent(url);
            const encodedText = encodeURIComponent(text);

            const targets = {
                whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
                facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
                twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
                instagram: null // Instagram has no web share URL
            };

            if (platform === 'copy') {
                await copyLink(url);
                return;
            }

            if (platform === 'instagram') {
                await copyLink(url);
                showToast('Link copied — paste it in your Instagram story! 📸', 'success');
                return;
            }

            window.open(targets[platform], '_blank', 'noopener,noreferrer,width=640,height=560');
        });
    });

    async function copyLink(link) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(link);
            } else {
                // Fallback for non-secure contexts.
                const temp = document.createElement('textarea');
                temp.value = link;
                temp.setAttribute('readonly', '');
                temp.style.position = 'absolute';
                temp.style.left = '-9999px';
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                temp.remove();
            }
            showToast('Link copied to clipboard. 🔗', 'success');
        } catch {
            showToast(`Copy failed. Here is the link: ${link}`, 'info', 6000);
        }
    }
}

/* ------------------------------------------------------------
   Scroll reveal
   ------------------------------------------------------------ */
function initScrollReveal() {
    const targets = $$('.feature-card, .message-card, .gallery-item, .stat-item, .share-section');
    // Dynamic grids (messages/gallery) already animate on render.
    const staticTargets = targets.filter((el) => !el.classList.contains('message-card') && !el.classList.contains('gallery-item'));

    staticTargets.forEach((el) => el.classList.add('reveal'));

    if (!('IntersectionObserver' in window)) {
        staticTargets.forEach((el) => el.classList.add('visible'));
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    staticTargets.forEach((el) => observer.observe(el));
}

/* ------------------------------------------------------------
   Not-configured notice
   Shown when BACKEND is empty, so the site never silently looks
   like it has no messages when the real cause is missing config.
   ------------------------------------------------------------ */
function showConfigNotice() {
    console.error('[birthday] ' + CONFIG_ERROR);
    showToast(CONFIG_ERROR, 'error', 8000);

    const notice = (emptySel, buttonSel) => {
        const empty = $(emptySel);
        if (!empty) return;
        empty.classList.remove('hidden');
        const heading = empty.querySelector('h3');
        const para = empty.querySelector('p');
        if (heading) heading.textContent = 'Not connected';
        if (para) para.textContent = CONFIG_ERROR;
        $(buttonSel)?.classList.add('hidden');
    };

    notice('#emptyState', '#firstMessageBtn');
    notice('#galleryEmptyState', '#firstUploadBtn');
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
async function init() {
    initAmbientBackground();
    initNavigation();
    initCountdown();

    // Messages (messages.html + the homepage quick form)
    initMessageModal();
    initMessageForm();
    initQuickMessageForm();

    // Gallery (gallery.html)
    initUpload();
    initGalleryFilter();
    initLightbox();

    // Thank-you page
    initConfetti();
    initShare();

    initScrollReveal();

    if (backendEnabled()) {
        console.info('[birthday] Shared backend mode:', BACKEND.supabaseUrl);
    } else {
        console.error('[birthday] ' + CONFIG_ERROR);
    }

    await Promise.all([
        renderMessages(),
        loadGallery(),
        initVisitorCount()
    ]);

    await updateThankYouStats();
    initStatsCounters();

    if (!backendEnabled()) showConfigNotice();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); });
} else {
    init();
}
