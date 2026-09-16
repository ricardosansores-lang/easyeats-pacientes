// Panel de Ricardo: pacientes, consulta, pendientes, videos, novedades y archivos privados de la presentación.
// La seguridad la aplica Supabase: solo las cuentas de la tabla administradores pueden leer o escribir datos de pacientes.
(() => {
  const C = window.PORTAL_CONFIG || {};
  const KEY = 'easyeats-sesion';
  const BUCKET = C.bucket || 'espacios';
  const $ = s => document.querySelector(s);
  let actual = null;
  const PAQUETES = {'cada-7': 'Paquete cada 7 días', 'cada-15': 'Paquete cada 15 días', 'cada-21': 'Paquete cada 21 días'};

  // --- Código y mejoras -------------------------------------------------------
  // Solo se publica desde aquí lo que corre DESPUÉS del acceso. El cascarón que hace
  // el login (index.html, config.js, portal.js, acceso.js) vive en GitHub a propósito:
  // si un archivo malo lo rompiera, nadie podría entrar ni siquiera a este panel.
  const PRODUCTO = 'easyway';
  const BUCKET_CODIGO = 'plataforma';
  const MAX_VERSIONES = 10;
  const PUBLICABLES = {
    'inicio.js': {nombre: 'Pantalla de Inicio', tipo: 'text/javascript', ext: ['js']},
    'extra.css': {nombre: 'Ajustes de estilo', tipo: 'text/css', ext: ['css']}
  };
  let superAdmin = false;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} },
    clear() { try { localStorage.removeItem(KEY); } catch {} }
  };
  const fecha = iso => new Intl.DateTimeFormat('es-MX', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(iso));
  // Mérida no tiene horario de verano: UTC−6 todo el año.
  const aLocal = iso => iso ? new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Merida', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(iso)).replace(' ', 'T') : '';
  const deLocal = v => v ? `${v}:00-06:00` : null;
  const idDeYoutube = texto => (String(texto).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) || String(texto).trim().match(/^([A-Za-z0-9_-]{11})$/) || [])[1] || null;
  const esUid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const api = (path, {token, headers, ...opt} = {}) => fetch(C.supabaseUrl + path, {
    ...opt,
    headers: {apikey: C.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...headers}
  });
  const toSession = d => ({access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + d.expires_in, user_id: d.user.id});

  async function sesion() {
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

  function traducir(status, j) {
    if (j?.code === '23505') return 'Ese registro ya existe.';
    if (j?.code === '23503') return 'Ese User UID no corresponde a una cuenta de Supabase.';
    if (j?.code === '23514') return 'Revisa los datos: alguno no tiene el formato correcto.';
    if (status === 401 || status === 403 || j?.code === '42501') return 'Tu cuenta no tiene permiso para esta acción.';
    return j?.message || 'No se pudo completar la acción.';
  }

  async function db(method, path, body) {
    const s = await sesion();
    if (!s) { mostrarLogin('Tu sesión terminó. Vuelve a entrar.'); throw new Error('Tu sesión terminó.'); }
    const r = await api(path, {method, token: s.access_token, cache: 'no-store', headers: method === 'GET' ? {} : {Prefer: 'return=minimal'}, body: body === undefined ? undefined : JSON.stringify(body)});
    const texto = await r.text();
    const json = texto ? (() => { try { return JSON.parse(texto); } catch { return null; } })() : null;
    if (!r.ok) throw new Error(traducir(r.status, json));
    return json;
  }

  let avisoTimer;
  function avisar(texto, error = false) {
    const a = $('#aviso');
    a.textContent = texto;
    a.classList.toggle('error', error);
    a.classList.add('visible');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => a.classList.remove('visible'), error ? 6000 : 2500);
  }

  function mostrarLogin(mensaje = '') {
    $('#panel-app').hidden = true;
    $('#salir').hidden = true;
    $('#panel-login').hidden = false;
    $('#login-msg').textContent = mensaje;
  }

  async function iniciar() {
    const s = await sesion();
    if (!s) return mostrarLogin();
    let admin = false;
    try { admin = await db('POST', '/rest/v1/rpc/es_admin', {}) === true; } catch {}
    if (!admin) {
      mostrarLogin('Esta cuenta no tiene acceso al panel.');
      $('#salir').hidden = false;
      return;
    }
    // La pestaña de código solo aparece para el super admin; la base ya lo impide
    // igual, pero no tiene caso mostrar un botón que va a fallar.
    try { superAdmin = await db('POST', '/rest/v1/rpc/es_super_admin', {}) === true; } catch {}
    $('#tabs').hidden = !superAdmin;
    $('#panel-login').hidden = true;
    $('#panel-app').hidden = false;
    $('#salir').hidden = false;
    await cargarPacientes();
  }

  async function cargarPacientes() {
    const pacientes = await db('GET', '/rest/v1/pacientes?select=user_id,nombre,consulta_fecha,paquete&order=nombre.asc');
    $('#lista-pacientes').innerHTML = pacientes.length
      ? pacientes.map(p => `<li><button type="button" data-paciente="${esc(p.user_id)}" aria-current="${p.user_id === actual}"><strong>${esc(p.nombre)}</strong><small>${p.consulta_fecha ? `Consulta: ${esc(fecha(p.consulta_fecha))}` : 'Consulta por agendar'} · ${esc(PAQUETES[p.paquete] || 'Sin paquete')}</small></button></li>`).join('')
      : '<li class="vacio">Aún no hay pacientes.</li>';
  }

  async function abrirPaciente(id) {
    actual = id;
    const q = encodeURIComponent(id);
    const [pacientes, pendientes, hechos, recursos, novedades, archivos] = await Promise.all([
      db('GET', `/rest/v1/pacientes?select=*&user_id=eq.${q}`),
      db('GET', `/rest/v1/pendientes?select=id,texto,creado_en&paciente_id=eq.${q}&order=creado_en.asc`),
      db('GET', `/rest/v1/pendientes_hechos?select=pendiente_id,completado_en&user_id=eq.${q}`),
      db('GET', `/rest/v1/recursos?select=id,sesion,youtube_id,titulo,nota,creado_en&paciente_id=eq.${q}&order=sesion.asc.nullslast,creado_en.asc`),
      db('GET', `/rest/v1/novedades_documentos?select=id,texto,creado_en&paciente_id=eq.${q}&order=creado_en.desc`),
      db('POST', `/storage/v1/object/list/${BUCKET}`, {prefix: id, limit: 100, offset: 0, sortBy: {column: 'name', order: 'asc'}}).catch(() => null)
    ]);
    const p = pacientes[0];
    if (!p) { $('#editor').innerHTML = '<p class="vacio">No se encontró la paciente.</p>'; return; }
    const completado = new Map(hechos.map(h => [h.pendiente_id, h.completado_en]));
    const lista = (items, fila, vacio) => `<ul class="filas">${items.length ? items.map(fila).join('') : `<li class="vacio">${vacio}</li>`}</ul>`;
    const quitar = (accion, id, etiqueta) => `<button type="button" class="btn-quitar" data-accion="${accion}" data-id="${esc(id)}" aria-label="Quitar: ${esc(etiqueta)}">Quitar</button>`;
    const archivosVisibles = (archivos || []).filter(a => a.name && !a.name.startsWith('.'));

    $('#editor').innerHTML = `
      <div class="editor-head"><span class="eyebrow">PACIENTE</span><h1>${esc(p.nombre)}</h1><code>${esc(p.user_id)}</code></div>

      <section class="bloque"><h2>Datos y próxima consulta</h2>
        <form data-form="datos" class="rejilla" novalidate>
          <label>Nombre<input name="nombre" required maxlength="80" value="${esc(p.nombre)}"></label>
          <label>Saludo<select name="saludo">${[['femenino', 'Bienvenida'], ['masculino', 'Bienvenido'], ['neutro', 'Neutro']].map(([v, t]) => `<option value="${v}"${p.saludo === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="ancho">Carpeta de Google Drive<input name="drive_url" type="url" placeholder="https://drive.google.com/drive/folders/…" value="${esc(p.drive_url || '')}"></label>
          <label>Próxima consulta (hora de Mérida)<input name="consulta_fecha" type="datetime-local" value="${aLocal(p.consulta_fecha)}"></label>
          <label>Lugar<input name="consulta_lugar" maxlength="80" placeholder="Cordemex" value="${esc(p.consulta_lugar || '')}"></label>
          <label>Paquete<select name="paquete">${[['', 'Sin paquete'], ...Object.entries(PAQUETES)].map(([v, t]) => `<option value="${v}"${(p.paquete || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="acciones ancho"><button class="btn" type="submit">Guardar datos</button>${p.consulta_fecha ? '<button class="btn-sec" type="button" data-accion="por-agendar">Dejar consulta por agendar</button>' : ''}</div>
        </form>
      </section>

      <section class="bloque"><h2>Pendientes</h2>
        ${lista(pendientes, x => `<li><span>${esc(x.texto)}<small>${completado.has(x.id) ? `✓ Completado el ${esc(fecha(completado.get(x.id)))}` : `Agregado el ${esc(fecha(x.creado_en))}`}</small></span>${quitar('quitar-pendiente', x.id, x.texto)}</li>`, 'Sin pendientes.')}
        <form data-form="pendiente" class="en-linea" novalidate><input name="texto" required maxlength="300" aria-label="Nuevo pendiente" placeholder="Nuevo pendiente, por ejemplo: Enviar análisis clínicos."><button class="btn" type="submit">Agregar</button></form>
      </section>

      <section class="bloque"><h2>Videos</h2>
        ${lista(recursos, x => `<li><img src="https://i.ytimg.com/vi/${esc(x.youtube_id)}/default.jpg" alt="" width="64" height="48"><span>${esc(x.titulo)}<small>${x.sesion ? `Mes ${Math.ceil(x.sesion / 2)} · Sesión ${x.sesion}` : 'Sin sesión'}${x.nota ? ` · ${esc(x.nota)}` : ''}</small></span>${quitar('quitar-recurso', x.id, x.titulo)}</li>`, 'Sin videos.')}
        <form data-form="recurso" class="rejilla" novalidate>
          <label class="ancho">Enlace de YouTube<input name="url" required placeholder="https://youtu.be/… (también sirve el código para integrar)"></label>
          <label>Sesión<input name="sesion" type="number" min="1" max="24" placeholder="2"></label>
          <label>Título<input name="titulo" required maxlength="140"></label>
          <label class="ancho">Nota para la paciente (opcional)<input name="nota" maxlength="300" placeholder="Mira este video antes de nuestra próxima consulta."></label>
          <div class="acciones ancho"><button class="btn" type="submit">Agregar video</button></div>
        </form>
      </section>

      <section class="bloque"><h2>Novedades en documentos</h2>
        <p class="ayuda">Úsalo cuando dejes algo nuevo en su carpeta de Drive: al entrar verá la etiqueta "Novedad".</p>
        ${lista(novedades, x => `<li><span>${esc(x.texto)}<small>${esc(fecha(x.creado_en))}</small></span>${quitar('quitar-novedad', x.id, x.texto)}</li>`, 'Sin novedades.')}
        <form data-form="novedad" class="en-linea" novalidate><input name="texto" required maxlength="200" aria-label="Nueva novedad" placeholder="Por ejemplo: Acuerdos de la sesión 2."><button class="btn" type="submit">Agregar</button></form>
      </section>

      <section class="bloque"><h2>Presentación 3Dx (archivos privados)</h2>
        <p class="ayuda">Sube aquí los archivos de <code>privado/&lt;paciente&gt;</code>. Si ya existe uno con el mismo nombre, se reemplaza.</p>
        ${archivos === null ? '<p class="vacio">No se pudo leer la carpeta de archivos.</p>' : lista(archivosVisibles, a => `<li><span>${esc(a.name)}<small>${a.metadata?.size ? `${Math.max(1, Math.round(a.metadata.size / 1024))} KB · ` : ''}${a.updated_at ? esc(fecha(a.updated_at)) : ''}</small></span>${quitar('quitar-archivo', a.name, a.name)}</li>`, 'Sin archivos: verá «Estamos preparando tu espacio».')}
        <form data-form="archivos" class="en-linea" novalidate><input name="archivos" type="file" multiple required aria-label="Archivos de la presentación" accept=".html,.js,.json,.jpg,.jpeg,.png,.webp,.svg"><button class="btn" type="submit">Subir archivos</button></form>
      </section>`;
    await cargarPacientes();
  }

  async function subir(id, archivos) {
    const s = await sesion();
    if (!s) throw new Error('Tu sesión terminó.');
    if (!archivos.length) throw new Error('Elige al menos un archivo.');
    for (const archivo of archivos) {
      if (!/^[\w.-]+$/.test(archivo.name)) throw new Error(`Nombre de archivo no permitido: ${archivo.name}`);
      const r = await api(`/storage/v1/object/${BUCKET}/${id}/${archivo.name}`, {method: 'POST', token: s.access_token, headers: {'x-upsert': 'true', 'Content-Type': archivo.type || 'application/octet-stream'}, body: archivo});
      if (!r.ok) throw new Error(`No se pudo subir ${archivo.name}.`);
    }
  }

  const rutaVersion = (archivo, version) => `${PRODUCTO}/${archivo}/v${version}`;

  async function anotar(versionId, archivo, version, accion) {
    const s = await sesion();
    await db('POST', '/rest/v1/codigo_bitacora', {version_id: versionId, producto: PRODUCTO, archivo, version, accion, quien: s.user_id}).catch(() => {});
  }

  async function cargarCodigo() {
    const [versiones, bitacora] = await Promise.all([
      db('GET', `/rest/v1/codigo_versiones?select=*&producto=eq.${PRODUCTO}&order=archivo.asc,version.desc`),
      db('GET', `/rest/v1/codigo_bitacora?select=*&producto=eq.${PRODUCTO}&order=cuando.desc&limit=12`).catch(() => [])
    ]);
    // Tolerante a propósito: una fecha vacía o rara no debe dejar la pantalla en blanco.
    const cuando = iso => {
      const d = iso ? new Date(iso) : null;
      return d && !isNaN(d) ? new Intl.DateTimeFormat('es-MX', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(d) : 'sin fecha';
    };
    const peso = b => b ? `${Math.max(1, Math.round(b / 1024))} KB` : '';

    const bloques = Object.entries(PUBLICABLES).map(([archivo, meta]) => {
      const mias = versiones.filter(v => v.archivo === archivo);
      const viva = mias.find(v => v.estado === 'publicado');
      const filas = mias.map(v => {
        const publicada = v.estado === 'publicado';
        const etiqueta = publicada ? 'EN LÍNEA' : v.estado === 'borrador' ? 'Sin publicar' : 'Anterior';
        const acciones = [
          `<a class="btn-sec" href="index.html?preview=${esc(v.id)}" target="_blank" rel="noopener">Probar</a>`,
          publicada ? '' : `<button type="button" class="btn" data-accion="publicar-codigo" data-id="${esc(v.id)}" data-archivo="${esc(archivo)}" data-version="${v.version}">${viva && v.version < viva.version ? 'Volver a esta' : 'Publicar'}</button>`,
          publicada ? '' : `<button type="button" class="btn-quitar" data-accion="quitar-codigo" data-id="${esc(v.id)}" data-ruta="${esc(v.ruta)}" data-archivo="${esc(archivo)}" data-version="${v.version}">Quitar</button>`
        ].join('');
        return `<li class="${publicada ? 'viva' : ''}"><span>v${v.version} · ${esc(etiqueta)}${v.notas ? ` — ${esc(v.notas)}` : ''}<small>${esc(cuando(v.subido_en))}${v.bytes ? ` · ${peso(v.bytes)}` : ''}</small></span><span class="acciones-fila">${acciones}</span></li>`;
      });
      return `<section class="bloque"><h2>${esc(meta.nombre)} <code>${esc(archivo)}</code></h2>
        <p class="ayuda">${viva ? `En línea ahora: <strong>v${viva.version}</strong>, publicada el ${esc(cuando(viva.publicado_en || viva.subido_en))}` :'Sin versión publicada: los pacientes ven lo que está en GitHub.'}</p>
        <ul class="filas">${filas.length ? filas.join('') : '<li class="vacio">Aún no subes ninguna versión.</li>'}</ul>
        <form data-form="codigo" data-archivo="${esc(archivo)}" class="rejilla" novalidate>
          <label class="ancho">Archivo nuevo<input name="archivo" type="file" required accept=".${meta.ext.join(',.')}"></label>
          <label class="ancho">¿Qué cambia? (opcional)<input name="notas" maxlength="300" placeholder="Por ejemplo: textos nuevos del Inicio."></label>
          <div class="acciones ancho"><button class="btn" type="submit">Subir versión</button></div>
        </form></section>`;
    });

    const registro = bitacora.length
      ? `<ul class="filas">${bitacora.map(b => `<li><span>${esc(b.archivo)} v${b.version} · ${esc(b.accion)}<small>${esc(cuando(b.cuando))}</small></span></li>`).join('')}</ul>`
      : '<p class="vacio">Todavía no hay movimientos.</p>';

    $('#panel-codigo').innerHTML = `
      <div class="editor-head"><span class="eyebrow">MI EASYWAY</span><h1>Código y mejoras</h1></div>
      <p class="ayuda">Sube el archivo, pruébalo tú con «Probar» y solo entonces publícalo.
        «Probar» abre el portal cargando esa versión sin que nadie más la vea.
        Si algo sale mal, «Volver a esta» en una versión anterior lo deshace al instante.
        El acceso y el cascarón del portal no se actualizan desde aquí: esos van por GitHub.</p>
      ${bloques.join('')}
      <section class="bloque"><h2>Últimos movimientos</h2>${registro}</section>`;
  }

  async function subirVersion(archivo, file, notas) {
    const meta = PUBLICABLES[archivo];
    if (!meta) throw new Error('Ese archivo no se puede publicar desde el panel.');
    if (!file) throw new Error('Elige un archivo.');
    if (!file.size) throw new Error('El archivo está vacío.');
    if (file.size > 2 * 1024 * 1024) throw new Error('El archivo pasa de 2 MB. Revisa que sea el correcto.');
    const s = await sesion();
    if (!s) throw new Error('Tu sesión terminó.');

    // Se calcula con el máximo de TODAS las versiones, no con la primera fila:
    // así el número es correcto aunque el servidor devuelva otro orden.
    const previas = await db('GET', `/rest/v1/codigo_versiones?select=version&producto=eq.${PRODUCTO}&archivo=eq.${encodeURIComponent(archivo)}`);
    const version = previas.reduce((mayor, v) => Math.max(mayor, v.version || 0), 0) + 1;
    const ruta = rutaVersion(archivo, version);

    const r = await api(`/storage/v1/object/${BUCKET_CODIGO}/${ruta}`, {method: 'POST', token: s.access_token, headers: {'x-upsert': 'true', 'Content-Type': meta.tipo}, body: file});
    if (!r.ok) throw new Error('No se pudo subir el archivo a Supabase.');

    // El id se genera aquí para poder anotarlo en la bitácora sin pedirlo de vuelta.
    const id = crypto.randomUUID();
    await db('POST', '/rest/v1/codigo_versiones', {id, producto: PRODUCTO, archivo, version, ruta, estado: 'borrador', notas: notas.trim() || null, bytes: file.size, subido_por: s.user_id});
    await anotar(id, archivo, version, 'subida');
    await podar(archivo);
    return version;
  }

  async function publicarVersion(id, archivo, version) {
    // Primero se archiva la que está en línea: la base no permite dos publicadas a la vez.
    await db('PATCH', `/rest/v1/codigo_versiones?producto=eq.${PRODUCTO}&archivo=eq.${encodeURIComponent(archivo)}&estado=eq.publicado`, {estado: 'archivado'});
    await db('PATCH', `/rest/v1/codigo_versiones?id=eq.${encodeURIComponent(id)}`, {estado: 'publicado', publicado_en: new Date().toISOString()});
    await anotar(id, archivo, version, 'publicada');
  }

  async function podar(archivo) {
    const todas = await db('GET', `/rest/v1/codigo_versiones?select=id,version,ruta,estado&producto=eq.${PRODUCTO}&archivo=eq.${encodeURIComponent(archivo)}&order=version.desc`);
    for (const v of todas.slice(MAX_VERSIONES).filter(x => x.estado !== 'publicado')) {
      await db('DELETE', `/storage/v1/object/${BUCKET_CODIGO}`, {prefixes: [v.ruta]}).catch(() => {});
      await db('DELETE', `/rest/v1/codigo_versiones?id=eq.${encodeURIComponent(v.id)}`).catch(() => {});
    }
  }

  function verVista(vista) {
    const codigo = vista === 'codigo';
    $('#panel-app').hidden = codigo;
    $('#panel-codigo').hidden = !codigo;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.vista === vista));
    if (codigo) cargarCodigo().catch(err => avisar(err.message, true));
  }

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-vista]');
    if (b) verVista(b.dataset.vista);
  });

  $('#panel-codigo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.form !== 'codigo') return;
    const boton = f.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      const version = await subirVersion(f.dataset.archivo, f.elements.archivo.files[0], f.elements.notas.value);
      avisar(`Subida la v${version}. Pruébala antes de publicar.`);
      await cargarCodigo();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      boton.disabled = false;
    }
  });

  $('#panel-codigo').addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    try {
      if (b.dataset.accion === 'publicar-codigo') {
        if (!confirm(`¿Publicar la v${b.dataset.version} de ${b.dataset.archivo}? La verán todos los pacientes al entrar.`)) return;
        await publicarVersion(b.dataset.id, b.dataset.archivo, Number(b.dataset.version));
        avisar('Publicada. Recuerda recargar con Cmd + Shift + R para verla.');
      } else if (b.dataset.accion === 'quitar-codigo') {
        if (!confirm(`¿Quitar la v${b.dataset.version} de ${b.dataset.archivo}? Ya no podrás volver a ella.`)) return;
        await db('DELETE', `/storage/v1/object/${BUCKET_CODIGO}`, {prefixes: [b.dataset.ruta]}).catch(() => {});
        await db('DELETE', `/rest/v1/codigo_versiones?id=eq.${encodeURIComponent(b.dataset.id)}`);
        await anotar(null, b.dataset.archivo, Number(b.dataset.version), 'borrada');
        avisar('Versión quitada.');
      } else return;
      await cargarCodigo();
    } catch (err) { avisar(err.message, true); }
  });

  $('#form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const boton = e.target.querySelector('button');
    boton.disabled = true;
    try {
      const r = await api('/auth/v1/token?grant_type=password', {method: 'POST', body: JSON.stringify({email: $('#email').value.trim(), password: $('#password').value})});
      if (!r.ok) throw new Error(r.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Correo o contraseña incorrectos.');
      store.set(toSession(await r.json()));
      $('#password').value = '';
      await iniciar();
    } catch (err) {
      $('#login-msg').textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  });

  $('#salir').addEventListener('click', async () => {
    const s = store.get();
    store.clear();
    if (s) await api('/auth/v1/logout', {method: 'POST', token: s.access_token}).catch(() => {});
    location.reload();
  });

  $('#lista-pacientes').addEventListener('click', e => {
    const b = e.target.closest('[data-paciente]');
    if (b) abrirPaciente(b.dataset.paciente).catch(err => avisar(err.message, true));
  });

  $('#form-nuevo').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const uid = d.user_id.trim();
    if (!esUid(uid)) return avisar('El User UID no tiene el formato correcto.', true);
    if (!d.nombre.trim()) return avisar('Escribe el nombre.', true);
    try {
      await db('POST', '/rest/v1/pacientes', {user_id: uid, nombre: d.nombre.trim(), saludo: d.saludo});
      e.target.reset();
      e.target.closest('details').open = false;
      avisar('Paciente agregada.');
      await abrirPaciente(uid);
    } catch (err) { avisar(err.message, true); }
  });

  $('#editor').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const d = Object.fromEntries(new FormData(f));
    const boton = f.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      switch (f.dataset.form) {
        case 'datos':
          if (!d.nombre.trim()) throw new Error('Escribe el nombre.');
          if (d.drive_url.trim() && !/^https:\/\/drive\.google\.com\//.test(d.drive_url.trim())) throw new Error('El enlace de la carpeta debe empezar con https://drive.google.com/');
          await db('PATCH', `/rest/v1/pacientes?user_id=eq.${encodeURIComponent(actual)}`, {nombre: d.nombre.trim(), saludo: d.saludo, drive_url: d.drive_url.trim() || null, consulta_fecha: deLocal(d.consulta_fecha), consulta_lugar: d.consulta_lugar.trim() || null, paquete: d.paquete || null, actualizado_en: new Date().toISOString()});
          break;
        case 'pendiente':
          if (!d.texto.trim()) throw new Error('Escribe el pendiente.');
          await db('POST', '/rest/v1/pendientes', {paciente_id: actual, texto: d.texto.trim()});
          break;
        case 'recurso': {
          const youtube = idDeYoutube(d.url);
          if (!youtube) throw new Error('No reconozco ese enlace de YouTube.');
          if (!d.titulo.trim()) throw new Error('Escribe el título del video.');
          await db('POST', '/rest/v1/recursos', {paciente_id: actual, youtube_id: youtube, sesion: d.sesion ? Number(d.sesion) : null, titulo: d.titulo.trim(), nota: d.nota.trim() || null});
          break;
        }
        case 'novedad':
          if (!d.texto.trim()) throw new Error('Escribe la novedad.');
          await db('POST', '/rest/v1/novedades_documentos', {paciente_id: actual, texto: d.texto.trim()});
          break;
        case 'archivos':
          await subir(actual, f.elements.archivos.files);
          break;
      }
      avisar('Guardado.');
      await abrirPaciente(actual);
    } catch (err) {
      avisar(err.message, true);
      boton.disabled = false;
    }
  });

  $('#editor').addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const q = encodeURIComponent(b.dataset.id || '');
    try {
      switch (b.dataset.accion) {
        case 'por-agendar':
          await db('PATCH', `/rest/v1/pacientes?user_id=eq.${encodeURIComponent(actual)}`, {consulta_fecha: null, consulta_lugar: null, actualizado_en: new Date().toISOString()});
          break;
        case 'quitar-pendiente':
          if (!confirm('¿Quitar este pendiente? Si ya lo había completado, también se pierde ese registro.')) return;
          await db('DELETE', `/rest/v1/pendientes?id=eq.${q}`);
          break;
        case 'quitar-recurso':
          if (!confirm('¿Quitar este video?')) return;
          await db('DELETE', `/rest/v1/recursos?id=eq.${q}`);
          break;
        case 'quitar-novedad':
          await db('DELETE', `/rest/v1/novedades_documentos?id=eq.${q}`);
          break;
        case 'quitar-archivo':
          if (!confirm(`¿Borrar ${b.dataset.id}? La paciente dejará de ver lo que dependa de este archivo.`)) return;
          await db('DELETE', `/storage/v1/object/${BUCKET}`, {prefixes: [`${actual}/${b.dataset.id}`]});
          break;
        default: return;
      }
      avisar('Guardado.');
      await abrirPaciente(actual);
    } catch (err) { avisar(err.message, true); }
  });

  if (!C.supabaseUrl || C.supabaseUrl.includes('TU-PROYECTO')) { mostrarLogin('Panel sin configurar: falta completar config.js.'); return; }
  iniciar().catch(() => mostrarLogin('No pudimos conectar. Intenta de nuevo.'));
})();
