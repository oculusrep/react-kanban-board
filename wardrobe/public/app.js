// Wardrobe web page: login, browse/search, add (photo → AI auto-fill → confirm → save), edit.
const app = document.getElementById('app');
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const FORMALITIES = ['casual', 'business', 'formal'];
let CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'activewear', 'sleepwear', 'swimwear', 'underwear', 'other'];
const browseState = { query: '', category: '', sort: 'newest', items: [], total: 0 };

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = app) => root.querySelector(sel);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

class AuthError extends Error {}

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) throw new AuthError('unauthorized');
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
const send = (path, method, body) => api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seasonLabel(s) {
  return !s || s[0] === 'all' ? 'all seasons' : s.join(', ');
}

/** Downscale + re-encode to JPEG so uploads are small and EXIF orientation is baked in. */
async function shrinkImage(file, maxSide = 1280, quality = 0.85) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback for browsers without createImageBitmap support for this type.
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image. Try a JPEG or PNG.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// ---------- views ----------
function renderLogin(message) {
  app.innerHTML = `
    <h1>Sign in</h1>
    <p class="muted">Enter your wardrobe token (the WARDROBE_TOKEN secret). This device stays signed in.</p>
    <form id="login">
      <label for="token">Token</label>
      <input id="token" type="password" autocomplete="current-password" required>
      ${message ? `<div class="status warn">${esc(message)}</div>` : ''}
      <div class="actions"><button class="btn block">Sign in</button></div>
    </form>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await send('/api/login', 'POST', { token: $('#token').value.trim() });
      route();
    } catch (err) {
      renderLogin(err instanceof AuthError ? 'Wrong token.' : err.message);
    }
  });
}

function cardHtml(item) {
  const meta = [item.color, item.category, item.formality].filter(Boolean).join(' · ');
  const img = item.photo_url
    ? `<img src="${esc(item.photo_url)}" alt="" loading="lazy">`
    : 'No photo';
  return `<a class="card" href="#/item/${esc(item.id)}">
    <div class="ph">${img}</div>
    <div class="body"><div class="name">${esc(item.name)}</div><div class="meta">${esc(meta)}</div></div>
  </a>`;
}

async function loadItems(append = false) {
  const p = new URLSearchParams({ sort: browseState.sort, limit: '60', offset: String(append ? browseState.items.length : 0) });
  if (browseState.query) p.set('query', browseState.query);
  if (browseState.category) p.set('category', browseState.category);
  const data = await api(`/api/items?${p}`);
  browseState.items = append ? browseState.items.concat(data.items) : data.items;
  browseState.total = data.total;
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  const { items, total } = browseState;
  if (!items.length) {
    box.innerHTML = `<div class="empty">${browseState.query || browseState.category ? 'Nothing matches.' : 'Your wardrobe is empty.<br><br><a class="btn" href="#/add">Add your first item</a>'}</div>`;
    return;
  }
  box.innerHTML = `<p class="muted">${total} item${total === 1 ? '' : 's'}</p>
    <div class="grid">${items.map(cardHtml).join('')}</div>
    ${items.length < total ? '<button class="btn secondary more" id="more">Load more</button>' : ''}`;
  $('#more')?.addEventListener('click', async () => { await loadItems(true); renderResults(); });
}

async function renderBrowse() {
  app.innerHTML = `
    <form class="search" id="search" role="search">
      <input type="search" id="q" placeholder="Search name, brand, color, notes…" value="${esc(browseState.query)}" enterkeyhint="search">
      <select id="sort" aria-label="Sort">
        ${[['newest', 'Newest'], ['name', 'A–Z'], ['least_recently_worn', 'Least worn lately'], ['last_worn', 'Recently worn'], ['most_worn', 'Most worn'], ['price', 'Price']]
          .map(([v, l]) => `<option value="${v}" ${browseState.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </form>
    <div class="chips" id="chips">
      ${['', ...CATEGORIES].map((c) => `<button class="chip" data-cat="${c}" aria-pressed="${browseState.category === c}">${c || 'all'}</button>`).join('')}
    </div>
    <div id="results"><p class="muted"><span class="spinner"></span>Loading…</p></div>`;

  let debounce;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => { browseState.query = e.target.value.trim(); await loadItems(); renderResults(); }, 250);
  });
  $('#search').addEventListener('submit', (e) => { e.preventDefault(); $('#q').blur(); });
  $('#sort').addEventListener('change', async (e) => { browseState.sort = e.target.value; await loadItems(); renderResults(); });
  $('#chips').addEventListener('click', async (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    browseState.category = b.dataset.cat;
    app.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    await loadItems();
    renderResults();
  });
  await loadItems();
  renderResults();
}

function formHtml(item = {}) {
  const seasons = item.season && item.season[0] !== 'all' ? item.season : [];
  const formality = item.formality || 'casual';
  return `
    <label for="f-name">Name</label>
    <input type="text" id="f-name" name="name" required value="${esc(item.name)}" placeholder="e.g. Navy oxford shirt">
    <div class="row">
      <div><label for="f-category">Category</label>
        <select id="f-category" name="category">${CATEGORIES.map((c) => `<option ${c === (item.category || 'other') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label for="f-color">Color</label><input type="text" id="f-color" name="color" value="${esc(item.color)}"></div>
    </div>
    <label>Formality</label>
    <div class="seg" role="radiogroup">${FORMALITIES.map((f) => `<label><input type="radio" name="formality" value="${f}" ${f === formality ? 'checked' : ''}>${f}</label>`).join('')}</div>
    <label>Season <span class="muted" style="font-weight:400">(none = all year)</span></label>
    <div class="seg">${SEASONS.map((s) => `<label><input type="checkbox" name="season" value="${s}" ${seasons.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}</div>
    <div class="row">
      <div><label for="f-brand">Brand</label><input type="text" id="f-brand" name="brand" value="${esc(item.brand)}"></div>
      <div><label for="f-size">Size</label><input type="text" id="f-size" name="size" value="${esc(item.size)}"></div>
    </div>
    <div class="row">
      <div><label for="f-price">Price</label><input type="number" id="f-price" name="price" inputmode="decimal" step="0.01" min="0" value="${item.price ?? ''}"></div>
      <div><label for="f-pd">Purchased</label><input type="date" id="f-pd" name="purchase_date" value="${esc(item.purchase_date)}"></div>
    </div>
    <label for="f-notes">Notes</label>
    <textarea id="f-notes" name="notes" placeholder="Fabric, fit, care, what it goes with…">${esc(item.notes)}</textarea>`;
}

function readForm(form) {
  const fd = new FormData(form);
  const seasons = fd.getAll('season');
  return {
    name: fd.get('name')?.trim(),
    category: fd.get('category'),
    color: fd.get('color')?.trim() || null,
    formality: fd.get('formality'),
    season: seasons.length ? seasons : 'all',
    brand: fd.get('brand')?.trim() || null,
    size: fd.get('size')?.trim() || null,
    price: fd.get('price') === '' ? null : Number(fd.get('price')),
    purchase_date: fd.get('purchase_date') || null,
    notes: fd.get('notes')?.trim() || null,
  };
}

/** Fill only fields the user hasn't typed into; mark them as AI-suggested. */
function applySuggestion(form, s) {
  const touched = form.dataset.touched ? JSON.parse(form.dataset.touched) : {};
  const set = (name, value) => {
    if (!value || touched[name]) return;
    const el = form.elements[name];
    if (!el) return;
    el.value = value;
    const lab = form.querySelector(`label[for="${el.id}"]`);
    if (lab && !lab.querySelector('.ai-tag')) lab.insertAdjacentHTML('beforeend', '<span class="ai-tag">AI</span>');
  };
  set('name', s.name);
  set('color', s.color);
  set('brand', s.brand);
  if (!form.elements.notes.value) set('notes', s.notes);
  set('category', s.category);
  if (s.formality && !touched.formality) {
    form.querySelectorAll('input[name=formality]').forEach((r) => { r.checked = r.value === s.formality; });
  }
  if (s.season && !touched.season) {
    const list = s.season === 'all' ? [] : s.season.split(',');
    form.querySelectorAll('input[name=season]').forEach((c) => { c.checked = list.includes(c.value); });
  }
}

function trackTouched(form) {
  const touched = {};
  form.addEventListener('input', (e) => { if (e.isTrusted && e.target.name) { touched[e.target.name] = true; form.dataset.touched = JSON.stringify(touched); } });
}

function photoPickerHtml(existingUrl) {
  return `
    <div class="photo-pick">
      <button type="button" class="btn" id="take">📷 Take photo</button>
      <button type="button" class="btn secondary" id="pick">🖼 Choose photo</button>
    </div>
    <input type="file" id="cam" accept="image/*" capture="environment" hidden>
    <input type="file" id="lib" accept="image/*" hidden>
    <div class="preview" id="preview">${existingUrl ? `<img src="${esc(existingUrl)}" alt="Item photo">` : 'No photo yet'}</div>
    <div id="photo-status"></div>`;
}

/** Wires the photo buttons. onUploaded(photo_key) is awaited after upload. */
function wirePhotoPicker({ form, autoFill }) {
  const state = { photoKey: null, busy: false };
  const status = (html, cls = '') => { $('#photo-status').innerHTML = html ? `<div class="status ${cls}">${html}</div>` : ''; };
  const onFile = async (file) => {
    if (!file) return;
    state.busy = true;
    form.querySelector('[type=submit]').disabled = true;
    try {
      status('<span class="spinner"></span>Preparing photo…');
      const blob = await shrinkImage(file);
      $('#preview').innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Item photo">`;
      status('<span class="spinner"></span>Uploading…');
      const old = state.photoKey;
      const up = await api('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      state.photoKey = up.photo_key;
      if (old) api(`/api/photos/${old}`, { method: 'DELETE' }).catch(() => {});
      if (autoFill) {
        status('<span class="spinner"></span>Auto-filling from photo…', 'ai');
        try {
          const s = await send('/api/analyze', 'POST', { photo_key: up.photo_key });
          applySuggestion(form, s);
          status('Filled in by AI — check the fields marked <span class="ai-tag">AI</span>, edit anything, then save.', 'ai');
        } catch (err) {
          if (err instanceof AuthError) throw err;
          status(`Photo saved, but auto-fill didn't work (${esc(err.message)}). Fill the fields in yourself.`, 'warn');
        }
      } else {
        status('New photo ready — tap Save to keep it.');
      }
    } catch (err) {
      if (err instanceof AuthError) return renderLogin('Session expired — sign in again.');
      status(esc(err.message), 'warn');
    } finally {
      state.busy = false;
      form.querySelector('[type=submit]').disabled = false;
    }
  };
  $('#take').addEventListener('click', () => $('#cam').click());
  $('#pick').addEventListener('click', () => $('#lib').click());
  $('#cam').addEventListener('change', (e) => onFile(e.target.files[0]));
  $('#lib').addEventListener('change', (e) => onFile(e.target.files[0]));
  return state;
}

function renderAdd() {
  app.innerHTML = `
    <h1>Add item</h1>
    ${photoPickerHtml()}
    <form id="item-form">
      ${formHtml()}
      <div class="actions two">
        <a class="btn secondary" href="#/" id="cancel">Cancel</a>
        <button class="btn" type="submit">Save</button>
      </div>
    </form>`;
  const form = $('#item-form');
  trackTouched(form);
  const photo = wirePhotoPicker({ form, autoFill: true });
  $('#cancel').addEventListener('click', () => {
    if (photo.photoKey) api(`/api/photos/${photo.photoKey}`, { method: 'DELETE' }).catch(() => {});
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (photo.busy) return;
    const body = readForm(form);
    if (photo.photoKey) body.photo_key = photo.photoKey;
    try {
      const item = await send('/api/items', 'POST', body);
      toast(`Saved “${item.name}”`);
      location.hash = '#/';
    } catch (err) {
      if (err instanceof AuthError) return renderLogin('Session expired — sign in again.');
      toast(err.message);
    }
  });
}

async function renderItem(id) {
  app.innerHTML = '<p class="muted"><span class="spinner"></span>Loading…</p>';
  const item = await api(`/api/items/${encodeURIComponent(id)}`);
  app.innerHTML = `
    <h1>${esc(item.name)}</h1>
    <div class="stats">
      <div class="stat"><b>${item.times_worn}</b><span>times worn</span></div>
      <div class="stat"><b>${item.last_worn ? esc(item.last_worn) : '—'}</b><span>last worn</span></div>
    </div>
    <div class="actions"><button class="btn" id="wore">✓ Wore it today</button></div>
    ${photoPickerHtml(item.photo_url)}
    <form id="item-form">
      ${formHtml(item)}
      <div class="actions two">
        <a class="btn secondary" href="#/">Back</a>
        <button class="btn" type="submit">Save changes</button>
      </div>
      <div class="actions"><button type="button" class="btn danger" id="delete">Delete item</button></div>
    </form>`;
  const form = $('#item-form');
  trackTouched(form);
  const photo = wirePhotoPicker({ form, autoFill: false });

  $('#wore').addEventListener('click', async () => {
    await send(`/api/items/${item.id}/wear`, 'POST', { date: today() });
    toast('Logged as worn today');
    renderItem(id);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (photo.busy) return;
    const body = readForm(form);
    if (photo.photoKey) body.photo_key = photo.photoKey;
    const saved = await send(`/api/items/${item.id}`, 'PATCH', body);
    toast(`Saved “${saved.name}”`);
    location.hash = '#/';
  });
  $('#delete').addEventListener('click', async () => {
    if (!confirm(`Delete “${item.name}” and its photo? This can't be undone.`)) return;
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    if (photo.photoKey) api(`/api/photos/${photo.photoKey}`, { method: 'DELETE' }).catch(() => {});
    toast('Deleted');
    location.hash = '#/';
  });
}

// ---------- router ----------
async function route() {
  const hash = location.hash || '#/';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === hash));
  window.scrollTo(0, 0);
  try {
    if (!route.checked) {
      const meta = await api('/api/session');
      if (meta.categories) CATEGORIES = meta.categories;
      route.checked = true;
    }
    if (hash.startsWith('#/item/')) return await renderItem(decodeURIComponent(hash.slice(7)));
    if (hash === '#/add') return renderAdd();
    return await renderBrowse();
  } catch (err) {
    if (err instanceof AuthError) { route.checked = false; return renderLogin(); }
    app.innerHTML = `<div class="status warn">${esc(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof AuthError) { route.checked = false; renderLogin('Session expired — sign in again.'); }
  else toast(e.reason?.message || 'Something went wrong');
});
route();
