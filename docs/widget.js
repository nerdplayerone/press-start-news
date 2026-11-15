/* PRESS START News Cards widget. No tracking, no cookies, no third-party scripts.
 * Install: <div id="ps-news" data-limit="12" data-theme="dark"></div>
 *          <script src="https://<github-user>.github.io/press-start-news/widget.js" defer></script>
 * Options on the div: data-limit (first batch, default 12), data-theme (dark|light), data-src (cards.json URL override). */
(function () {
  'use strict';

  /* ---- Brand: DIGITAL DOPAMINE (near-black, white, electric yellow, cyan/magenta glitch accents) ---- */
  var THEMES = {
    dark: {
      '--ps-bg': '#1a1a1a', '--ps-card': '#222222', '--ps-border': '#333333', '--ps-hover': '#f5f500',
      '--ps-text': '#ffffff', '--ps-muted': '#bdbdbd', '--ps-link': '#f5f500',
      '--ps-focus': '#f5f500', '--ps-skeleton': '#2b2b2b', '--ps-badge-bg': '#f5f500', '--ps-badge-text': '#1a1a1a',
      '--ps-btn-bg': '#ffffff', '--ps-btn-text': '#1a1a1a',
      '--ps-release': '#f5f500', '--ps-hardware': '#3ee8ff', '--ps-industry': '#ff3ec8'
    },
    light: {
      '--ps-bg': '#ffffff', '--ps-card': '#ffffff', '--ps-border': '#e7e7e7', '--ps-hover': '#1a1a1a',
      '--ps-text': '#1a1a1a', '--ps-muted': '#4a4a4a', '--ps-link': '#1a1a1a',
      '--ps-focus': '#1a1a1a', '--ps-skeleton': '#eeeeee', '--ps-badge-bg': '#1a1a1a', '--ps-badge-text': '#f5f500',
      '--ps-btn-bg': '#1a1a1a', '--ps-btn-text': '#ffffff',
      '--ps-release': '#c9c900', '--ps-hardware': '#0aa5bd', '--ps-industry': '#c4169a'
    }
  };
  /* Body font: the site's Aktiv Grotesk. Display font (labels, button): the site's Lo-Res pixel font.
     Both are already loaded by Squarespace; elsewhere the fallbacks are used. */
  var BODY_FONT = '"aktiv-grotesk"';
  var DISPLAY_FONT = '"lo-res-12-bold-alt-oakland"';
  var STEP = 12, MAX = 36;
  var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var EMPTY = 'News is updating. Check back soon.';

  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/[^/]*$/, '') : '';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ago(iso) {
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (!isFinite(s)) return '';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : null; }

  /* Inherit the site font only when it is sans-serif. */
  function pickFont(host) {
    var f = getComputedStyle(host).fontFamily || '';
    var first = f.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    var serifish = /(^|\s)serif$/.test(f.trim().toLowerCase()) || /georgia|times|garamond|serif/.test(first) && !/sans/.test(first);
    return BODY_FONT + ', ' + (f && !serifish ? f + ', ' : '') + SANS;
  }

  var CSS = [
    ':host{display:block;container-type:inline-size}',
    '.ps{font-family:var(--ps-font);color:var(--ps-text);line-height:1.45;-webkit-font-smoothing:antialiased}',
    '.grid{display:grid;gap:16px;grid-template-columns:1fr;margin:0;padding:0;list-style:none}',
    '@container (min-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}',
    '@container (min-width:1024px){.grid{grid-template-columns:repeat(3,1fr)}}',
    'article{background:var(--ps-card);border:1px solid var(--ps-border);border-radius:6px;overflow:hidden;display:flex;flex-direction:column;height:100%;transition:border-color .15s,transform .15s}',
    'article:hover{border-color:var(--ps-hover);transform:translateY(-2px)}',
    '@media (prefers-reduced-motion:reduce){article,article:hover{transition:none;transform:none}}',
    '.img{display:block;width:100%;aspect-ratio:460/215;object-fit:cover;background:var(--ps-skeleton)}',
    '.bar{height:6px}',
    '.release{background:var(--ps-release)}.hardware{background:var(--ps-hardware)}.industry{background:var(--ps-industry)}',
    '.body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}',
    '.meta{font-family:var(--ps-display);font-size:13px;color:var(--ps-muted);text-transform:uppercase;letter-spacing:.06em;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.cat-release{color:var(--ps-release)}.cat-hardware{color:var(--ps-hardware)}.cat-industry{color:var(--ps-industry)}',
    '.badge{background:var(--ps-badge-bg);color:var(--ps-badge-text);border-radius:3px;padding:2px 6px}',
    'h3{margin:0;font-size:17px;line-height:1.3;font-weight:700}',
    '.why{margin:0;font-size:15px;color:var(--ps-muted)}',
    '.links{margin-top:auto;padding-top:4px;font-size:14px}',
    'a{color:var(--ps-link);font-weight:700;text-decoration:none;border-radius:3px}',
    'a:hover{text-decoration:underline;text-underline-offset:3px}',
    'a:focus-visible,button:focus-visible{outline:3px solid var(--ps-focus);outline-offset:2px}',
    '.also{margin-top:4px;font-size:12px;color:var(--ps-muted)}.also a{font-weight:500;color:var(--ps-text)}',
    '.more{display:block;margin:24px auto 0;font-family:var(--ps-display);font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--ps-btn-text);background:var(--ps-btn-bg);border:0;border-radius:4px;padding:12px 26px;cursor:pointer}',
    '.more:hover{background:var(--ps-hover);color:var(--ps-badge-text)}',
    '.msg{padding:24px 16px;text-align:center;color:var(--ps-muted);border:1px dashed var(--ps-border);border-radius:6px;margin:0}',
    '.sk{height:240px;border-radius:6px;background:var(--ps-skeleton);animation:p 1.4s ease-in-out infinite}',
    '@keyframes p{50%{opacity:.55}}',
    '@media (prefers-reduced-motion:reduce){.sk{animation:none}}'
  ].join('');

  function card(c) {
    var url = safeUrl(c.source && c.source.url);
    if (!url || !c.tldr) return null;
    var li = el('li');
    var art = el('article');
    var img = c.image && safeUrl(c.image.url);
    if (img) {
      var i = el('img', 'img');
      i.src = img; i.loading = 'lazy'; i.decoding = 'async';
      i.alt = c.game_name || '';
      i.width = 460; i.height = 215;
      i.onerror = function () { i.replaceWith(el('div', 'bar ' + c.category)); };
      art.appendChild(i);
    } else {
      art.appendChild(el('div', 'bar ' + c.category));
    }
    var body = el('div', 'body');
    var meta = el('div', 'meta');
    var cat = String(c.category || '');
    meta.appendChild(el('span', 'cat-' + cat, cat));
    meta.appendChild(el('span', '', ago(c.source.published_at)));
    if (c.confidence === 'low') meta.appendChild(el('span', 'badge', 'Early report'));
    body.appendChild(meta);
    body.appendChild(el('h3', '', c.tldr));
    if (c.why_it_matters) body.appendChild(el('p', 'why', c.why_it_matters));
    var links = el('div', 'links');
    var a = el('a', '', 'Read on ' + c.source.outlet);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    links.appendChild(a);
    var also = (c.also_on || []).filter(function (x) { return safeUrl(x.url); });
    if (also.length) {
      var al = el('div', 'also', 'Also on ');
      also.forEach(function (x, n) {
        var l = el('a', '', x.outlet);
        l.href = x.url; l.target = '_blank'; l.rel = 'noopener noreferrer';
        if (n) al.appendChild(document.createTextNode(', '));
        al.appendChild(l);
      });
      links.appendChild(al);
    }
    body.appendChild(links);
    art.appendChild(body);
    li.appendChild(art);
    return li;
  }

  function mount(host) {
    if (host.__psNews) return;
    host.__psNews = true;
    var theme = THEMES[host.getAttribute('data-theme')] || THEMES.dark;
    var first = Math.min(MAX, Math.max(1, parseInt(host.getAttribute('data-limit'), 10) || STEP));
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = el('style');
    var vars = Object.keys(theme).map(function (k) { return k + ':' + theme[k]; }).join(';');
    var font = pickFont(host);
    style.textContent = ':host{' + vars + ';--ps-font:' + font + ';--ps-display:' + DISPLAY_FONT + ', ' + font + '}' + CSS;
    var wrap = el('section', 'ps');
    wrap.setAttribute('aria-label', 'Latest gaming news');
    root.appendChild(style);
    root.appendChild(wrap);

    var grid = el('ul', 'grid');
    grid.setAttribute('aria-busy', 'true');
    for (var s = 0; s < 3; s++) { var sk = el('li', 'sk'); sk.setAttribute('aria-hidden', 'true'); grid.appendChild(sk); }
    wrap.appendChild(grid);

    function message() { wrap.textContent = ''; wrap.appendChild(el('p', 'msg', EMPTY)); }

    function render(data) {
      var cards = (data && data.cards || []).slice(0, MAX).map(card).filter(Boolean);
      if (!cards.length) return message();
      wrap.textContent = '';
      var list = el('ul', 'grid');
      wrap.appendChild(list);
      var shown = 0;
      var btn = el('button', 'more', 'Show more');
      btn.type = 'button';
      function add(n) {
        var end = Math.min(cards.length, shown + n);
        for (; shown < end; shown++) list.appendChild(cards[shown]);
        if (shown >= cards.length) btn.remove();
      }
      btn.onclick = function () {
        var next = shown;
        add(STEP);
        var a = cards[next] && cards[next].querySelector('a');
        if (a) a.focus({ preventScroll: false });
      };
      add(first);
      if (shown < cards.length) wrap.appendChild(btn);
    }

    if (window.PS_NEWS) return render(window.PS_NEWS); /* cards.js fallback, no cross-origin fetch */
    var src = host.getAttribute('data-src') || base + 'cards.json';
    var v = Math.floor(Date.now() / 600000);
    fetch(src + (src.indexOf('?') < 0 ? '?' : '&') + 'v=' + v, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(message);
  }

  function init() {
    var hosts = document.querySelectorAll('#ps-news, [data-ps-news]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
