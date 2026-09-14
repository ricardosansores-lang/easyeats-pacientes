// Acceso con Supabase Auth (correo y contraseña) y descarga de la presentación desde un bucket privado.
// La seguridad la aplica Supabase: sin sesión válida, Storage no entrega ningún archivo.
(() => {
  // GitHub Pages no permite cabeceras anti-iframe: nunca mostrar el acceso dentro de otro sitio.
  if (window.top !== window.self) { document.body.innerHTML = ''; return; }
  const C = window.PORTAL_CONFIG || {};
  const KEY = 'easyeats-sesion';
  const BUCKET = C.bucket || 'espacios';
  const $ = s => document.querySelector(s);
  const blobUrls = [];

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} },
    clear() { try { localStorage.removeItem(KEY); } catch {} }
  };

  const api = (path, {token, headers, ...opt} = {}) => fetch(C.supabaseUrl + path, {
    ...opt,
    headers: {apikey: C.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...headers}
  });

  const toSession = d => ({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + d.expires_in,
    user_id: d.user.id
  });

  async function signIn(email, password) {
    const r = await api('/auth/v1/token?grant_type=password', {method: 'POST', body: JSON.stringify({email, password})});
    if (r.status === 429) throw new Error('limite');
    if (!r.ok) throw new Error('credenciales');
    return toSession(await r.json());
  }

  async function currentSession() {
    let s = store.get();
    if (!s) return null;
    if (s.expires_at - 60 < Date.now() / 1000) {
      const r = await api('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: JSON.stringify({refresh_token: s.refresh_token})});
      if (!r.ok) { store.clear(); return null; }
      s = toSession(await r.json());
      store.set(s);
    }
    return s;
  }

  async function privateFile(s, name, as = 'text') {
    const r = await api(`/storage/v1/object/authenticated/${BUCKET}/${s.user_id}/${name}`, {token: s.access_token});
    if (r.status === 401 || r.status === 403) throw new Error('sesion');
    if (!r.ok) throw new Error('sin-contenido');
    return as === 'blob' ? r.blob() : r.text();
  }

  function loadScript(code) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => { URL.revokeObjectURL(url); resolve(); };
      el.onerror = reject;
      document.body.appendChild(el);
    });
  }

  function message(text, error = false) {
    const m = $('#portal-message');
    m.textContent = text;
    m.classList.toggle('error', error);
  }

  async function openSpace(s) {
    message('Abriendo tu espacio…');
    const manifest = JSON.parse(await privateFile(s, 'manifest.json'));
    const [html, content, app, ...images] = await Promise.all([
      privateFile(s, 'presentacion.html'), privateFile(s, 'content.js'), privateFile(s, 'app.js'),
      ...manifest.assets.map(n => privateFile(s, n, 'blob'))
    ]);
    const urls = {};
    manifest.assets.forEach((n, i) => { urls[n] = URL.createObjectURL(images[i]); blobUrls.push(urls[n]); });
    window.privateAsset = n => urls[n] || '';
    $('#login-screen').remove();
    document.title = manifest.title;
    document.body.insertAdjacentHTML('afterbegin', html);
    await loadScript(content);
    await loadScript(app);
    addAccountButton();
    // El Inicio es una mejora: si falla, la presentación sigue funcionando.
    try { await window.MiInicio?.montar({manifest, sesion: currentSession, api, userId: s.user_id}); } catch {}
  }

  function addAccountButton() {
    const b = document.createElement('button');
    b.className = 'account';
    b.type = 'button';
    b.textContent = 'Mi cuenta';
    b.addEventListener('click', () => $('#account-dialog').showModal());
    $('.tools')?.prepend(b);
  }

  async function logout() {
    const s = store.get();
    store.clear();
    blobUrls.forEach(URL.revokeObjectURL);
    if (s) await api('/auth/v1/logout', {method: 'POST', token: s.access_token}).catch(() => {});
    location.replace(location.pathname);
  }

  async function start(s) {
    try {
      await openSpace(s);
    } catch (e) {
      if (e.message === 'sesion') { store.clear(); message('Tu sesión terminó. Vuelve a entrar.', true); return; }
      message(e.message === 'sin-contenido' ? 'Estamos preparando tu espacio. Te avisaremos cuando esté listo.' : 'No pudimos abrir tu espacio. Revisa tu conexión e intenta de nuevo.', e.message !== 'sin-contenido');
      $('#login-logout').hidden = false;
    }
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || !password) return message('Escribe tu correo y tu contraseña.', true);
    const button = e.target.querySelector('.primary');
    button.disabled = true;
    try {
      const s = await signIn(email, password);
      store.set(s);
      $('#password').value = '';
      await start(s);
    } catch (err) {
      message(err.message === 'credenciales' ? 'Correo o contraseña incorrectos.' : err.message === 'limite' ? 'Demasiados intentos. Espera unos minutos.' : 'No pudimos conectar. Intenta de nuevo.', true);
    } finally {
      button.disabled = false;
    }
  });

  $('#password-form').addEventListener('submit', async e => {
    e.preventDefault();
    const out = $('#password-message'), pass = $('#new-password').value;
    const say = (t, err) => { out.textContent = t; out.classList.toggle('error', err); };
    if (pass.length < 8) return say('Usa al menos 8 caracteres.', true);
    if (pass !== $('#confirm-password').value) return say('Las contraseñas no coinciden.', true);
    const s = await currentSession();
    if (!s) return logout();
    const r = await api('/auth/v1/user', {method: 'PUT', token: s.access_token, body: JSON.stringify({password: pass})});
    if (!r.ok) return say('No se pudo guardar. Prueba con una contraseña distinta y más larga.', true);
    e.target.reset();
    say('Contraseña actualizada.', false);
  });

  $('#account-dialog .close').addEventListener('click', () => $('#account-dialog').close());
  $('#logout').addEventListener('click', logout);
  $('#login-logout').addEventListener('click', logout);

  if (!C.supabaseUrl || C.supabaseUrl.includes('TU-PROYECTO')) {
    message('Portal sin configurar: falta completar config.js.', true);
    return;
  }
  currentSession().then(s => s && start(s)).catch(() => message('No pudimos conectar. Intenta de nuevo.', true));
})();
