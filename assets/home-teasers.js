/* Pilzgebiete · Startseite
 * 1) Myzelpfad: alle Waldwissen-Beiträge aus derselben articles.json wie die App, abwechselnd links/rechts,
 *    mit Faden, der beim Scrollen wächst, und Pilzen, die an jeder Station aufgehen.
 * 2) Dezentes Einblenden markierter Elemente (data-reveal).
 * 3) Mitgestalten-Teaser mit der laufenden Frage aus community_poll.json.
 * Ohne JavaScript oder bei reduzierter Bewegung bleibt alles statisch sichtbar. */
(function () {
  'use strict';
  if (!window.fetch) return;
  var SITE = 'pilzgebiete-app.de';
  var PREVIEW = window.PG_PREVIEW || null; // nur in der privaten Vorschau gesetzt
  var CTRL = /[\x00-\x1f\x7f]/;
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var TONES = ['moss', 'ochre', 'loam', 'sage', 'stone'];
  var motion = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) && 'IntersectionObserver' in window;

  function str(v, max) { return typeof v === 'string' && v.trim() && v.length <= max && !CTRL.test(v) ? v.trim() : null; }
  function sitePath(v) {
    try {
      var u = new URL(v);
      if (u.protocol !== 'https:' || u.hostname !== SITE || u.port || u.username) return null;
      return u.pathname + u.search;
    } catch (e) { return null; }
  }
  function href(path) { return PREVIEW ? 'https://' + SITE + path : path; }
  function asset(path) { return PREVIEW ? path.replace(/^\//, '') : path; }
  function data(path) { return PREVIEW ? path.replace(/^\//, '') : path; }
  function month(iso) { var p = iso.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /* ---------- 1) Myzelpfad ---------- */
  var trail = document.querySelector('.trail[data-feed="articles"]');
  var stat = document.querySelector('[data-feed-stat]');
  var list = trail && trail.querySelector('.trail-list');
  var nodeTpl = list && list.querySelector('.stop-node');
  var stopsObserver = null;

  function observeStops() {
    if (!trail || !motion) return;
    if (stopsObserver) stopsObserver.disconnect();
    var vh = window.innerHeight;
    stopsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); stopsObserver.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(list.children, function (li) {
      var r = li.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) li.classList.add('in');
      else stopsObserver.observe(li);
    });
  }

  function threadProgress() {
    if (!trail || !motion) return;
    var ticking = false;
    function update() {
      ticking = false;
      var r = trail.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.75 - r.top) / Math.max(r.height, 1);
      trail.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Der Faden wird passend zu den tatsächlichen Stationen gezeichnet und läuft durch jeden Knoten.
  function fitThread() {
    if (!trail) return;
    var svg = trail.querySelector('.trail-thread');
    var nodes = trail.querySelectorAll('.stop-node');
    if (!svg || !nodes.length) return;
    var tr = trail.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    var W = sr.width, H = tr.height;
    if (!W || !H) return;
    var pts = Array.prototype.map.call(nodes, function (n) {
      var r = n.getBoundingClientRect();
      return [r.left + r.width / 2 - sr.left, r.top + r.height / 2 - tr.top];
    });
    var cx = pts[0][0], sway = W > 60 ? 20 : 9, prev = [cx, 0], d = 'M' + cx.toFixed(1) + ' 0';
    pts.concat([[cx, H]]).forEach(function (p, i) {
      var s = (i % 2 ? -1 : 1) * sway, dy = p[1] - prev[1];
      d += ' C' + (prev[0] + s).toFixed(1) + ' ' + (prev[1] + dy / 3).toFixed(1) + ' ' + (p[0] + s).toFixed(1) + ' ' +
        (prev[1] + 2 * dy / 3).toFixed(1) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      prev = p;
    });
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
    Array.prototype.forEach.call(svg.querySelectorAll('path'), function (p) { p.setAttribute('d', d); });
    trail.classList.add('fitted');
  }
  if (trail) {
    fitThread();
    if ('ResizeObserver' in window) new ResizeObserver(function () { requestAnimationFrame(fitThread); }).observe(trail);
    else window.addEventListener('resize', fitThread);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitThread);
  }

  if (trail && motion) { trail.classList.add('is-anim'); observeStops(); threadProgress(); }

  if (trail && list) {
    fetch(data('/articles.json'), { cache: 'no-cache', headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var seen = {};
        var items = (j && Array.isArray(j.articles) ? j.articles : []).map(function (a) {
          if (!a) return null;
          var item = {
            id: str(a.id, 80), title: str(a.title, 120), teaser: str(a.teaser, 180),
            date: typeof a.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.publishedAt) ? a.publishedAt : null,
            path: sitePath(a.url), img: a.imageUrl ? sitePath(a.imageUrl) : null, tag: str(a.tag, 40) || 'Waldwissen'
          };
          return item.id && item.title && item.teaser && item.date && item.path ? item : null;
        }).filter(function (a) {
          if (!a || seen[a.id] || seen[a.path]) return false;
          seen[a.id] = seen[a.path] = 1; return true;
        }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? -1 : 1); }).slice(0, 12);
        if (!items.length) return; // statische Stationen behalten

        if (stat) {
          var first = items[items.length - 1].date;
          stat.textContent = '';
          stat.appendChild(el('strong', null, items.length === 1 ? '1 Beitrag' : items.length + ' Beiträge'));
          stat.appendChild(document.createTextNode(' seit ' + month(first) + ' · jede Quelle im Beitrag verlinkt'));
        }

        list.textContent = '';
        items.forEach(function (a, i) {
          var li = el('li', 'stop'); li.setAttribute('data-tone', TONES[i % TONES.length]);
          var card = el('a', 'stop-card'); card.href = href(a.path);
          if (a.img) {
            var media = el('span', 'stop-media');
            var img = el('img'); img.src = asset(a.img); img.alt = ''; img.width = 1200; img.height = 675; img.loading = 'lazy'; img.decoding = 'async';
            media.appendChild(img); card.appendChild(media);
          }
          var body = el('span', 'stop-body');
          var meta = el('span', 'stop-meta');
          meta.appendChild(el('span', 'stop-tag', a.tag.toUpperCase() === 'NEU' ? 'Neu' : a.tag));
          var t = el('time', null, month(a.date)); t.setAttribute('datetime', a.date); meta.appendChild(t);
          body.appendChild(meta);
          body.appendChild(el('h3', 'stop-title', a.title));
          body.appendChild(el('span', 'stop-teaser', a.teaser));
          var more = el('span', 'stop-more', 'Beitrag lesen '); var arrow = el('span', null, '→'); arrow.setAttribute('aria-hidden', 'true'); more.appendChild(arrow);
          body.appendChild(more);
          card.appendChild(body);
          li.appendChild(card);
          if (nodeTpl) li.appendChild(nodeTpl.cloneNode(true));
          list.appendChild(li);
        });
        observeStops();
        fitThread();
      })
      .catch(function () { /* statische Stationen bleiben */ });
  }

  /* ---------- 2) Einblenden markierter Elemente ---------- */
  var reveal = document.querySelectorAll('[data-reveal]');
  if (motion && reveal.length) {
    var vh0 = window.innerHeight;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    Array.prototype.forEach.call(reveal, function (n) {
      if (n.getBoundingClientRect().top < vh0 * 0.9) n.classList.add('in'); else io.observe(n);
    });
    document.documentElement.classList.add('reveal-ready');
  }

  /* ---------- 3) Mitgestalten-Teaser ---------- */
  var title = document.querySelector('[data-teaser="title"]');
  var meta = document.querySelector('[data-teaser="meta"]');
  var text = document.querySelector('[data-teaser="text"]');
  var cta = document.querySelector('[data-teaser="cta"]');
  if (title && meta) {
    fetch(data('/community_poll.json'), { cache: 'no-cache', headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var t = str(j && j.title, 160);
        var start = new Date(j.startsAt), end = new Date(j.endsAt), now = new Date();
        var open = t && j.schemaVersion === 1 && j.status === 'active' && !isNaN(start) && !isNaN(end) && now >= start && now < end;
        if (!open) {
          title.textContent = 'Bald startet die erste Monatsabstimmung.';
          if (text) text.textContent = 'Stimm mit ab, welche Idee wir als Nächstes prüfen, oder schlag selbst etwas vor. Ohne Anmeldung, ohne E-Mail-Adresse.';
          if (cta) cta.textContent = 'Mehr erfahren';
          return;
        }
        title.textContent = t;
        try {
          var f = function (d, o) { return new Intl.DateTimeFormat('de-DE', Object.assign({ timeZone: 'Europe/Berlin' }, o)).format(d); };
          meta.textContent = 'Mitgestalten · ' + f(start, { month: 'long' }) + '-Runde bis ' + f(new Date(end - 1000), { day: 'numeric', month: 'long' });
        } catch (e) { /* Label bleibt */ }
      })
      .catch(function () { /* statischer Text bleibt */ });
  }
})();
