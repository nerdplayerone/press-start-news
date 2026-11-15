/* PRESS START News Cards widget. No tracking, no cookies, no third-party scripts.
 * Install: <div id="ps-news" data-limit="12" data-theme="dark"></div>
 *          <script src="https://<github-user>.github.io/press-start-news/widget.js" defer></script>
 * Options on the div: data-limit (first batch, default 12), data-theme (dark|light), data-src (cards.json URL override). */
(function () {
  'use strict';

  /* ---- Brand colours: edit these to match the site ---- */
  var THEMES = {
    dark: {
      '--ps-bg': '#14161a', '--ps-card': '#1d2026', '--ps-border': '#2c3038',
      '--ps-text': '#f2f3f5', '--ps-muted': '#b4b9c2', '--ps-link': '#7cc4ff',
      '--ps-focus': '#ffd34d', '--ps-skeleton': '#2a2e36', '--ps-badge-bg': '#3a3220', '--ps-badge-text': '#ffd98a',
      '--ps-release': '#4ade80', '--ps-hardware': '#60a5fa', '--ps-industry': '#f472b6'
    },
    light: {
      '--ps-bg': '#ffffff', '--ps-card': '#ffffff', '--ps-border': '#dfe2e7',
      '--ps-text': '#16181d', '--ps-muted': '#4b5160', '--ps-link': '#0b5cad',
      '--ps-focus': '#b45309', '--ps-skeleton': '#eceef1', '--ps-badge-bg': '#fdf0d5', '--ps-badge-text': '#7a4a00',
      '--ps-release': '#15803d', '--ps-hardware': '#1d4ed8', '--ps-industry': '#be185d'
    }
  };
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
    return f && !serifish ? f + ', ' + SANS : SANS;
  }

  var CSS = [
    ':host{display:block;container-type:inline-size}',
    '.ps{font-family:var(--ps-font);color:var(--ps-text);line-height:1.45;-webkit-font-smoothing:antialiased}',
    '.grid{display:grid;gap:16px;grid-template-columns:1fr;margin:0;padding:0;list-style:none}',
    '@container (min-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}',
    '@container (min-width:1024px){.grid{grid-template-columns:repeat(3,1fr)}}',
    'article{background:var(--ps-card);border:1px solid var(--ps-border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;height:100%}',
    '.img{display:block;width:100%;aspect-ratio:460/215;object-fit:cover;background:var(--ps-skeleton)}',
    '.bar{height:4px}',
    '.release{background:var(--ps-release)}.hardware{background:var(--ps-hardware)}.industry{background:var(--ps-industry)}',
    '.body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}',
    '.meta{font-size:12px;color:var(--ps-muted);text-transform:uppercase;letter-spacing:.04em;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.badge{background:var(--ps-badge-bg);color:var(--ps-badge-text);border-radius:4px;padding:1px 6px;text-transform:none;letter-spacing:0;font-weight:600}',
    'h3{margin:0;font-size:17px;line-height:1.3;font-weight:700}',
    '.why{margin:0;font-size:15px;color:var(--ps-muted)}',
    '.links{margin-top:auto;padding-top:4px;font-size:14px}',
    'a{color:var(--ps-link);font-weight:600;text-decoration:none;border-radius:3px}',
    'a:hover{text-decoration:underline}',
    'a:focus-visible,button:focus-visible{outline:3px solid var(--ps-focus);outline-offset:2px}',
    '.also{margin-top:4px;font-size:12px;color:var(--ps-muted)}.also a{font-weight:500}',
    '.more{display:block;margin:20px auto 0;font:inherit;font-weight:600;font-size:15px;color:var(--ps-text);background:var(--ps-card);border:1px solid var(--ps-border);border-radius:8px;padding:10px 22px;cursor:pointer}',
    '.more:hover{border-color:var(--ps-muted)}',
    '.msg{padding:24px 16px;text-align:center;color:var(--ps-muted);border:1px dashed var(--ps-border);border-radius:10px;margin:0}',
    '.sk{height:240px;border-radius:10px;background:var(--ps-skeleton);animation:p 1.4s ease-in-out infinite}',
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
    meta.appendChild(el('span', '', cat.charAt(0).toUpperCase() + cat.slice(1) + ' · ' + ago(c.source.published_at)));
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
    style.textContent = ':host{' + vars + ';--ps-font:' + pickFont(host) + '}' + CSS;
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
