// Deliberately page-local: no cookie, persistent storage or automatic consent.
export function installMapConsent({get, start, reload}) {
  let accepted = false;
  get('accept-map').onclick = () => {
    if (accepted) return;
    accepted = true;
    get('map-consent').hidden = true;
    get('withdraw-map').hidden = false;
    get('privacy-settings').hidden = false;
    get('load-status').textContent = 'Karte wird vorbereitet …';
    start();
  };
  get('reject-map').onclick = () => {
    if (accepted) return;
    get('consent-status').textContent = 'Nicht geladen. Quellen, Datenschutz und Homepage bleiben erreichbar.';
  };
  // A full navigation tears down SDK timers, handlers and in-flight requests.
  for (const id of ['withdraw-map', 'privacy-settings']) get(id).onclick = reload;
}
