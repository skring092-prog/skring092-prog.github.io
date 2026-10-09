/* Pilzgebiete · Mitgestalten (/mitgestalten/)
 * Reads the shared poll configuration (/community_poll.json, same contract as the app),
 * sends one vote per browser and poll to the vote counter, accepts idea submissions
 * and lists approved ideas.
 * Stored in this browser only after clicking "Abstimmen" or "Vorschlag senden": a random ID and the chosen option.
 * No cookies, no fingerprinting, no tracking. */
(function () {
  'use strict';

  var root = document.getElementById('mitgestalten');
  if (!root || !window.fetch || !window.JSON) return;

  var LOCAL = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  var API = LOCAL ? 'http://' + location.hostname + ':8787' : root.getAttribute('data-api');
  var KEY_ID = 'pilzgebiete.poll.voter.v1';
  var KEY_VOTED = 'pilzgebiete.poll.voted.v1';
  var ID_RE = /^[a-z0-9-]{1,64}$/;
  var TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var CTRL_RE = /[\x00-\x1f\x7f]/;

  function el(name) { return root.querySelector('[data-poll="' + name + '"]'); }
  var card = root.querySelector('.pollcard');
  var ui = {
    meta: el('meta'), title: el('title'), form: el('form'), options: el('options'), submit: el('submit'),
    done: el('done'), thanks: el('thanks'), toggle: el('toggle'), results: el('results'), msg: el('msg')
  };

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  var memoryId = null;

  function newUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // Created only when someone actually votes, never on page load.
  function voterId() {
    var id = store.get(KEY_ID);
    if (!id || !UUID_RE.test(id)) {
      id = memoryId || newUuid();
      store.set(KEY_ID, id);
    }
    memoryId = id;
    return id;
  }

  function votedRecord(pollId) {
    try {
      var r = JSON.parse(store.get(KEY_VOTED) || 'null');
      return r && r.poll_id === pollId ? r : null;
    } catch (e) { return null; }
  }

  // Same acceptance rules as the app (community_poll.dart, schemaVersion 1).
  function text(v, max) {
    if (typeof v !== 'string' || !v.trim() || v.length > max || CTRL_RE.test(v)) throw new Error('field');
    return v.trim();
  }
  function stamp(v) {
    var raw = text(v, 30);
    if (!TS_RE.test(raw)) throw new Error('ts');
    var d = new Date(raw);
    if (isNaN(d.getTime()) || d.toISOString() !== raw.replace('Z', '.000Z')) throw new Error('ts');
    return d;
  }
  function parsePoll(raw) {
    try {
      var j = JSON.parse(raw);
      if (!j || j.schemaVersion !== 1) return null;
      var id = text('poll_id' in j ? j.poll_id : j.id, 64);
      if ('poll_id' in j && 'id' in j && j.id !== id) return null;
      if (!ID_RE.test(id)) return null;
      var status = text(j.status, 10);
      if (['draft', 'active', 'closed'].indexOf(status) < 0) return null;
      var start = stamp(j.startsAt), end = stamp(j.endsAt);
      if (end <= start || end - start > 32 * 864e5) return null;
      if (!Array.isArray(j.options) || j.options.length < 2 || j.options.length > 5) return null;
      var seen = {}, options = j.options.map(function (o) {
        if (!o || typeof o.id !== 'string' || !ID_RE.test(o.id) || seen[o.id]) throw new Error('opt');
        seen[o.id] = 1;
        return { id: o.id, label: text(o.label, 120) };
      });
      return {
        id: id, title: text(j.title, 160), status: status, start: start, end: end, options: options,
        intro: j.intro == null ? null : text(j.intro, 300),
        lastResult: j.lastResult == null ? null : text(j.lastResult, 240),
        resultStatus: j.resultStatus == null ? null : text(j.resultStatus, 120)
      };
    } catch (e) { return null; }
  }

  function berlin(date, opts) {
    try { return new Intl.DateTimeFormat('de-DE', Object.assign({ timeZone: 'Europe/Berlin' }, opts)).format(date); }
    catch (e) { return ''; }
  }

  function say(message, isError) {
    ui.msg.textContent = message || '';
    ui.msg.classList.toggle('err', !!isError);
  }

  var poll = null, lastResults = null, chosen = null;

  function renderOptions() {
    poll.options.forEach(function (o, i) {
      var label = document.createElement('label');
      label.className = 'popt';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'poll-option';
      input.value = o.id;
      input.id = 'poll-opt-' + i;
      var span = document.createElement('span');
      span.textContent = o.label;
      label.appendChild(input);
      label.appendChild(span);
      ui.options.appendChild(label);
    });
    ui.options.addEventListener('change', function () { ui.submit.disabled = false; say(''); });
  }

  // Largest-remainder rounding so the shown percentages add up to 100.
  function percentages(counts, total) {
    if (!total) return counts.map(function () { return 0; });
    var raw = counts.map(function (c) { return c * 100 / total; });
    var floor = raw.map(Math.floor);
    var rest = 100 - floor.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (r, i) { return { i: i, f: r - floor[i] }; })
      .sort(function (a, b) { return b.f - a.f; })
      .slice(0, rest).forEach(function (x) { floor[x.i] += 1; });
    return floor;
  }

  function renderResults(res) {
    lastResults = res;
    var byId = {};
    res.options.forEach(function (o) { byId[o.id] = o.count; });
    var counts = poll.options.map(function (o) { return byId[o.id] || 0; });
    var pct = percentages(counts, res.total);
    var list = document.createElement('ul');
    list.className = 'pres';
    var bars = [];
    poll.options.forEach(function (o, i) {
      var li = document.createElement('li');
      if (chosen === o.id) li.className = 'mine';
      var row = document.createElement('div');
      row.className = 'row';
      var name = document.createElement('span');
      name.textContent = o.label;
      if (chosen === o.id) {
        var tag = document.createElement('span');
        tag.className = 'mine-tag';
        tag.textContent = 'Deine Wahl';
        name.appendChild(tag);
      }
      var p = document.createElement('span');
      p.className = 'pct';
      p.textContent = pct[i] + ' %';
      row.appendChild(name);
      row.appendChild(p);
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('span');
      bar.appendChild(fill);
      bars.push([fill, pct[i]]);
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = counts[i] === 1 ? '1 Stimme' : counts[i] + ' Stimmen';
      li.appendChild(row);
      li.appendChild(bar);
      li.appendChild(n);
      list.appendChild(li);
    });
    var total = document.createElement('p');
    total.className = 'ptotal';
    var time = berlin(new Date(res.updated_at), { hour: '2-digit', minute: '2-digit' });
    total.textContent = (res.total === 1 ? '1 Stimme' : res.total.toLocaleString('de-DE') + ' Stimmen') + (time ? ' · Stand ' + time + ' Uhr' : '');
    var note = document.createElement('p');
    note.className = 'pnote';
    note.textContent = 'Kein repräsentatives Ergebnis: Gezählt werden alle Stimmen, die hier abgegeben wurden.';
    ui.results.textContent = '';
    ui.results.appendChild(list);
    ui.results.appendChild(total);
    ui.results.appendChild(note);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bars.forEach(function (b) { b[0].style.width = b[1] + '%'; }); });
    });
  }

  function fetchResults() {
    return fetch(API + '/v1/results?poll_id=' + encodeURIComponent(poll.id), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { return j.results; });
  }

  function showResults() {
    var open = ui.toggle.getAttribute('aria-expanded') === 'true';
    if (open) {
      ui.toggle.setAttribute('aria-expanded', 'false');
      ui.toggle.textContent = 'Aktuellen Zwischenstand ansehen';
      ui.results.hidden = true;
      return;
    }
    say('');
    var ready = lastResults ? Promise.resolve(lastResults) : fetchResults();
    ready.then(function (res) {
      renderResults(res);
      ui.results.hidden = false;
      ui.toggle.setAttribute('aria-expanded', 'true');
      ui.toggle.textContent = 'Zwischenstand ausblenden';
    }).catch(function () {
      say('Der Zwischenstand ist gerade nicht erreichbar. Bitte versuche es später noch einmal.', true);
    });
  }

  function showDone(message) {
    ui.form.hidden = true;
    ui.done.hidden = false;
    ui.thanks.querySelector('span').textContent = message;
    card.setAttribute('data-state', 'done');
  }

  function remember(optionId) {
    chosen = optionId || null;
    store.set(KEY_VOTED, JSON.stringify({ poll_id: poll.id, option_id: chosen }));
  }

  function submit(event) {
    event.preventDefault();
    var picked = ui.form.querySelector('input[name="poll-option"]:checked');
    if (!picked) { say('Bitte wähle zuerst eine Antwort.', true); return; }
    if (!(new Date() < poll.end)) { closed(); return; }
    ui.submit.disabled = true;
    ui.submit.textContent = 'Wird gesendet …';
    say('');
    fetch(API + '/v1/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ poll_id: poll.id, option_id: picked.value, voter_id: voterId() }),
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (x) {
      if (x.status === 201) {
        remember(picked.value);
        lastResults = x.body.results || null;
        showDone('Danke! Deine Stimme wurde gezählt.');
        ui.toggle.focus();
      } else if (x.status === 200 && x.body.status === 'already_voted') {
        remember(null);
        lastResults = x.body.results || null;
        showDone('Aus diesem Browser wurde in dieser Runde schon abgestimmt.');
      } else if (x.status === 403 && x.body.error === 'poll_closed') {
        closed();
      } else if (x.status === 409 && x.body.error === 'poll_changed') {
        say('Die Abstimmung wurde gerade aktualisiert. Bitte lade die Seite neu.', true);
      } else if (x.status === 429) {
        throw { msg: 'Gerade kommen sehr viele Stimmen an. Bitte versuche es in ein paar Minuten noch einmal.' };
      } else {
        throw {};
      }
    }).catch(function (e) {
      ui.submit.disabled = false;
      ui.submit.textContent = 'Abstimmen';
      say((e && e.msg) || 'Deine Stimme konnte gerade nicht übertragen werden. Bitte versuche es später noch einmal.', true);
    });
  }

  function closed() {
    ui.form.hidden = true;
    card.setAttribute('data-state', 'closed');
    var parts = ['Diese Abstimmung ist beendet.'];
    if (poll.lastResult) parts.push('Ihr habt gewählt: ' + poll.lastResult);
    if (poll.resultStatus) parts.push('Status: ' + poll.resultStatus);
    say(parts.join(' '));
  }

  function waiting() {
    ui.form.hidden = true;
    card.setAttribute('data-state', 'waiting');
    ui.meta.textContent = 'Monatsabstimmung · bald';
    say('Die nächste Monatsabstimmung wird vorbereitet.');
  }

  /* ---------- Ideen: einreichen und freigegebene Vorschläge anzeigen ---------- */
  var IDEA_MIN = 8, IDEA_MAX = 200;
  var IDEA_BLOCK = /(https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[a-z]{2,}|\+?\d[\d\s()/-]{7,}\d)/i;
  var idea = {
    form: document.querySelector('[data-idea="form"]'), text: document.querySelector('[data-idea="text"]'),
    count: document.querySelector('[data-idea="count"]'), submit: document.querySelector('[data-idea="submit"]'),
    done: document.querySelector('[data-idea="done"]'), again: document.querySelector('[data-idea="again"]'),
    msg: document.querySelector('[data-idea="msg"]'),
    list: document.querySelector('[data-ideas="list"]'), empty: document.querySelector('[data-ideas="empty"]')
  };

  function ideaSay(message, isError) {
    if (!idea.msg) return;
    idea.msg.textContent = message || '';
    idea.msg.classList.toggle('err', !!isError);
  }

  function cleanIdea(v) { return v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim(); }

  function loadIdeas() {
    if (!idea.list) return;
    fetch(API + '/v1/ideas', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) {
        var items = (j && Array.isArray(j.ideas) ? j.ideas : []).filter(function (x) { return x && typeof x.text === 'string'; });
        idea.list.textContent = '';
        items.forEach(function (x) {
          var li = document.createElement('li');
          var q = document.createElement('p'); q.className = 'itext'; q.textContent = x.text;
          var d = document.createElement('span'); d.className = 'idate';
          var when = /^\d{4}-\d{2}-\d{2}$/.test(x.approved_at || '') ? berlin(new Date(x.approved_at + 'T12:00:00Z'), { month: 'long', year: 'numeric' }) : '';
          d.textContent = when ? 'Freigegeben im ' + when : 'Freigegeben';
          li.appendChild(q); li.appendChild(d); idea.list.appendChild(li);
        });
        if (idea.empty) idea.empty.hidden = items.length > 0;
      })
      .catch(function () { if (idea.empty) idea.empty.textContent = 'Die Vorschläge sind gerade nicht erreichbar.'; });
  }

  var ideasStarted = false;
  function initIdeas(current, up) {
    if (ideasStarted) return;
    ideasStarted = true;
    if (!up) {
      // Dienst noch nicht eingerichtet oder nicht erreichbar: ruhiger Vorab-Zustand statt Fehlermeldung.
      if (idea.empty) idea.empty.textContent = 'Sobald die ersten Vorschläge freigegeben sind, erscheinen sie hier.';
      if (idea.text) { idea.text.disabled = true; idea.submit.disabled = true; }
      ideaSay('Vorschläge kannst du hier in Kürze einreichen.');
      return;
    }
    loadIdeas();
    if (!idea.form) return;
    if (!current) {
      idea.text.disabled = true;
      ideaSay('Vorschläge sind gerade nicht möglich. Bitte schau später noch einmal vorbei.');
      return;
    }
    function update() {
      var n = idea.text.value.length;
      idea.count.textContent = n + '/' + IDEA_MAX;
      idea.submit.disabled = cleanIdea(idea.text.value).length < IDEA_MIN;
    }
    idea.text.addEventListener('input', function () { update(); ideaSay(''); });
    update();
    if (idea.again) idea.again.addEventListener('click', function () {
      idea.done.hidden = true; idea.form.hidden = false; idea.text.value = ''; update(); idea.text.focus();
    });
    idea.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = cleanIdea(idea.text.value);
      if (text.length < IDEA_MIN) { ideaSay('Bitte beschreib deine Idee in mindestens ' + IDEA_MIN + ' Zeichen.', true); return; }
      if (IDEA_BLOCK.test(text)) { ideaSay('Bitte keine Links, E-Mail-Adressen oder Telefonnummern eintragen.', true); return; }
      idea.submit.disabled = true;
      idea.submit.textContent = 'Wird gesendet …';
      fetch(API + '/v1/ideas', {
        method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ poll_id: current.id, voter_id: voterId(), text: text })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
      }).then(function (x) {
        idea.submit.textContent = 'Vorschlag senden';
        if (x.status === 201) {
          idea.form.hidden = true; idea.done.hidden = false; ideaSay('');
          if (idea.again) idea.again.focus();
          return;
        }
        var e = x.body && x.body.error;
        idea.submit.disabled = false;
        if (e === 'idea_limit') ideaSay('Aus diesem Browser sind in dieser Runde schon drei Vorschläge eingegangen. Danke!', true);
        else if (e === 'contact_or_link') ideaSay('Bitte keine Links, E-Mail-Adressen oder Telefonnummern eintragen.', true);
        else if (e === 'bad_length') ideaSay('Bitte zwischen ' + IDEA_MIN + ' und ' + IDEA_MAX + ' Zeichen schreiben.', true);
        else if (x.status === 429) ideaSay('Gerade kommen sehr viele Anfragen an. Bitte versuche es in ein paar Minuten noch einmal.', true);
        else ideaSay('Dein Vorschlag konnte gerade nicht gesendet werden. Bitte versuche es später noch einmal.', true);
      }).catch(function () {
        idea.submit.textContent = 'Vorschlag senden'; idea.submit.disabled = false;
        ideaSay('Dein Vorschlag konnte gerade nicht gesendet werden. Bitte versuche es später noch einmal.', true);
      });
    });
  }

  say('Abstimmung wird geladen …');
  // Ist der Stimmenzähler erreichbar? Ohne ihn bleiben Abstimmung und Vorschläge im Vorab-Zustand.
  var serviceUp = fetch(API + '/v1/health', { cache: 'no-store' })
    .then(function (r) { return r.text().then(function () { return r.ok; }); }) // Body lesen, damit die Anfrage sauber endet
    .catch(function () { return false; });
  Promise.all([
    fetch('/community_poll.json', { cache: 'no-cache', headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.text(); }),
    serviceUp
  ])
    .then(function (res) {
      var raw = res[0], up = res[1];
      poll = parsePoll(raw);
      initIdeas(poll, up);
      if (!poll) { waiting(); return; }
      ui.title.textContent = poll.title;
      var month = berlin(poll.start, { month: 'long' });
      var until = berlin(new Date(poll.end.getTime() - 1000), { day: 'numeric', month: 'long' });
      ui.meta.textContent = month ? month + '-Runde' + (until ? ' · bis ' + until : '') : 'Monatsabstimmung';
      var now = new Date();
      if (poll.status === 'closed' || now >= poll.end) { closed(); return; }
      if (poll.status !== 'active' || now < poll.start || !up) { waiting(); return; }
      renderOptions();
      ui.form.addEventListener('submit', submit);
      ui.toggle.addEventListener('click', showResults);
      var rec = votedRecord(poll.id);
      if (rec) {
        chosen = rec.option_id && ID_RE.test(rec.option_id) ? rec.option_id : null;
        showDone('Du hast in dieser Runde schon abgestimmt. Danke!');
        say('');
        return;
      }
      ui.form.hidden = false;
      card.setAttribute('data-state', 'open');
      say('');
    })
    .catch(function () { serviceUp.then(function (up) { initIdeas(null, up); }); waiting(); });
})();
