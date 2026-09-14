// Inicio de Mi EasyWay: bienvenida, próxima consulta, pendientes, recursos y documentos.
// Los datos vienen del manifest privado de cada paciente; la sesión y la API, de portal.js.
(() => {
  // Textos aprobados (ChatGPT, 14 sep 2026). {nombre} se sustituye por el nombre de la paciente.
  const TEXTOS = {
    bienvenida: {femenino: 'Bienvenida, {nombre}', masculino: 'Bienvenido, {nombre}', neutro: 'Qué bueno verte aquí, {nombre}'},
    primeraVez: 'Gracias por elegirnos para acompañarte en un proceso tan importante. Para nosotros, tu confianza merece atención, claridad y continuidad. Mi EasyWay es tu espacio de trabajo entre consultas: aquí encontrarás tus próximos pasos, materiales, documentos y recursos para comprender mejor tu proceso. No tienes que resolver todo hoy; iremos construyendo un camino claro, a tu ritmo y con acompañamiento profesional.',
    regreso: [
      'Hola, {nombre}. Tu proceso sigue aquí: revisa lo que tenemos preparado para ti.',
      'Qué bueno tenerte de vuelta, {nombre}. Vamos paso a paso, con claridad.',
      '{nombre}, este espacio guarda la continuidad de tu proceso entre consultas.'
    ],
    novedad: 'Tenemos algo nuevo para acompañar tu proceso.',
    sinPendientes: ['Por ahora no tienes pendientes.', 'Cuando haya un siguiente paso, lo encontrarás aquí.'],
    alDia: ['Vas al día con tus pendientes.', 'Este avance también forma parte de tu proceso. Seguimos construyendo desde aquí.'],
    sinVideos: ['Aún no tienes videos asignados.', 'Cuando tengamos un recurso útil para tu proceso, aparecerá aquí.'],
    pantallaInicio: ['Ten Mi EasyWay más cerca', 'Agrega este espacio a la pantalla de inicio de tu celular para entrar fácilmente cuando lo necesites.']
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const local = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };
  const fechaCorta = iso => new Intl.DateTimeFormat('es-MX', {day: 'numeric', month: 'short'}).format(new Date(iso));
  const idYoutube = v => /^[\w-]{11}$/.test(v || '') ? v : null;
  const vacio = ([fuerte, texto]) => `<p class="vacio"><strong>${fuerte}</strong><br>${texto}</p>`;

  function saludo(m, primeraVez) {
    const nombre = esc(m.paciente?.nombre || '');
    if (primeraVez) {
      const titulo = TEXTOS.bienvenida[m.paciente?.saludo] || TEXTOS.bienvenida.neutro;
      return {titulo: titulo.replaceAll('{nombre}', nombre), texto: TEXTOS.primeraVez};
    }
    // Una variante por día, para que no cambie en cada recarga.
    const frase = TEXTOS.regreso[Math.floor(Date.now() / 864e5) % TEXTOS.regreso.length].replaceAll('{nombre}', nombre);
    const corte = frase.indexOf('. ');
    return corte > 0 ? {titulo: frase.slice(0, corte + 1), texto: frase.slice(corte + 2)} : {titulo: frase, texto: ''};
  }

  function consultaHTML(m) {
    const c = m.consulta || {};
    const encabezado = '<span class="eyebrow">PRÓXIMA CONSULTA</span>';
    if (c.fecha) {
      // La fecha y el día de la semana se calculan del dato, nunca se escriben a mano.
      const d = new Date(c.fecha);
      const dia = new Intl.DateTimeFormat('es-MX', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Merida'}).format(d);
      const hora = new Intl.DateTimeFormat('es-MX', {hour: 'numeric', minute: '2-digit', timeZone: 'America/Merida'}).format(d);
      return `${encabezado}<h2>${esc(dia.charAt(0).toUpperCase() + dia.slice(1))}</h2><p>${esc(hora)}${c.lugar ? ` · ${esc(c.lugar)}` : ''}</p>`;
    }
    const whatsapp = /^\d{10,15}$/.test(m.whatsapp || '') ? m.whatsapp : null;
    const enlace = whatsapp && `https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero agendar mi próxima consulta de Mi EasyWay.')}`;
    return `${encabezado}<h2>Por agendar</h2><p>Cuando elijamos fecha y hora, las verás aquí.</p>${enlace ? `<a class="btn-inicio" href="${enlace}" target="_blank" rel="noopener noreferrer"><span class="btn-punto" aria-hidden="true"></span>Agendar por WhatsApp <span aria-hidden="true">↗</span></a>` : ''}`;
  }

  function avisoPantallaInicio() {
    const ua = navigator.userAgent;
    const movil = /iphone|ipad|ipod|android/i.test(ua);
    const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!movil || instalada || local.get('easyeats-aviso-inicio') === 'cerrado') return '';
    const pasos = /iphone|ipad|ipod/i.test(ua)
      ? 'En Safari toca <b>Compartir</b> y después <b>Agregar a pantalla de inicio</b>.'
      : 'Abre el menú del navegador y elige <b>Agregar a pantalla principal</b>.';
    return `<aside class="aviso-inicio" aria-label="${TEXTOS.pantallaInicio[0]}"><div><strong>${TEXTOS.pantallaInicio[0]}</strong><p>${TEXTOS.pantallaInicio[1]} ${pasos}</p></div><button type="button" class="cerrar" data-cerrar-aviso aria-label="Cerrar aviso">×</button></aside>`;
  }

  async function montar({manifest: m, sesion, api, userId}) {
    const header = document.querySelector('body > header.topbar');
    const main = document.getElementById('main');
    if (!header || !main || document.getElementById('mi-inicio')) return;

    // "Novedad" = agregado desde el día de la última visita en este dispositivo.
    const claveVisita = `easyeats-visita-${userId}`;
    const visitaAnterior = local.get(claveVisita);
    local.set(claveVisita, new Date().toISOString());
    const esNuevo = fecha => !visitaAnterior || (!!fecha && fecha >= visitaAnterior.slice(0, 10));

    const {titulo, texto} = saludo(m, !visitaAnterior);
    const pendientes = (m.pendientes || []).filter(p => p.id && p.texto);
    const recursos = (m.recursos || []).filter(r => idYoutube(r.youtube)).sort((a, b) => (a.sesion || 0) - (b.sesion || 0));
    const drive = /^https:\/\/drive\.google\.com\//.test(m.documentos?.drive || '') ? m.documentos.drive : null;
    const novedadesDocs = (m.documentos?.novedades || []).filter(n => n.texto && esNuevo(n.agregado));
    const hayNovedad = visitaAnterior && (recursos.some(r => esNuevo(r.agregado)) || novedadesDocs.length > 0 || pendientes.some(p => esNuevo(p.agregado)));

    const recursosHTML = recursos.length
      ? `<div class="recursos">${recursos.map(r => {
          const sesion = Number.isInteger(r.sesion) ? r.sesion : null;
          return `<div class="recurso"><div class="recurso-media"><button type="button" data-video="${r.youtube}" aria-label="Ver video: ${esc(r.titulo)}"><img src="https://i.ytimg.com/vi/${r.youtube}/hqdefault.jpg" alt="" loading="lazy"><span class="recurso-play" aria-hidden="true">▶</span></button></div><div class="recurso-body">${sesion ? `<small>MES ${Math.ceil(sesion / 2)} · SESIÓN ${sesion}</small>` : ''}${visitaAnterior && esNuevo(r.agregado) ? ' <span class="badge-nuevo">Novedad</span>' : ''}<h3>${esc(r.titulo)}</h3>${r.nota ? `<p>${esc(r.nota)}</p>` : ''}</div></div>`;
        }).join('')}</div>`
      : vacio(TEXTOS.sinVideos);

    const nav = document.createElement('nav');
    nav.className = 'portal-tabs';
    nav.setAttribute('aria-label', 'Secciones de Mi EasyWay');
    nav.innerHTML = '<div role="tablist"><button type="button" role="tab" data-portal-tab="inicio" aria-selected="true" aria-controls="mi-inicio">Inicio</button><button type="button" role="tab" data-portal-tab="proceso" aria-selected="false" aria-controls="main">Mi proceso</button></div>';

    const inicio = document.createElement('section');
    inicio.id = 'mi-inicio';
    inicio.className = 'mi-inicio';
    inicio.setAttribute('role', 'tabpanel');
    inicio.setAttribute('aria-labelledby', 'inicio-titulo');
    inicio.innerHTML = `${avisoPantallaInicio()}
      <div class="inicio-hero"><div><span class="eyebrow">MI EASYWAY</span><h1 id="inicio-titulo">${titulo}</h1>${texto ? `<p>${texto}</p>` : ''}${hayNovedad ? `<p class="inicio-novedad"><span class="badge-nuevo">Novedad</span>${TEXTOS.novedad}</p>` : ''}</div><div class="inicio-foto" aria-hidden="true"></div></div>
      <div class="inicio-grid">
        <article class="inicio-card card-consulta">${consultaHTML(m)}</article>
        <article class="inicio-card card-pendientes" aria-labelledby="pendientes-titulo"><span class="eyebrow">TU SIGUIENTE PASO</span><h2 id="pendientes-titulo" tabindex="-1">Tus pendientes</h2><div id="pendientes-lista"></div></article>
        <article class="inicio-card card-recursos" aria-labelledby="recursos-titulo"><span class="eyebrow">RECURSOS</span><h2 id="recursos-titulo">Material para acompañar tu proceso</h2>${recursosHTML}</article>
        <article class="inicio-card card-documentos" aria-labelledby="documentos-titulo"><div><span class="eyebrow">DOCUMENTOS</span><h2 id="documentos-titulo">Tus documentos</h2><p>Tu carpeta privada en Google Drive: ahí compartimos acuerdos y material, y también puedes subir tus propios archivos.</p>${novedadesDocs.length ? `<ul class="docs-nuevos">${novedadesDocs.map(n => `<li><span class="badge-nuevo">Novedad</span> ${esc(n.texto)}</li>`).join('')}</ul>` : ''}</div>${drive ? `<div class="docs-accion"><a class="btn-inicio" href="${esc(drive)}" target="_blank" rel="noopener noreferrer">Abrir mis documentos <span aria-hidden="true">↗</span></a><small>Se abre en Google Drive con tu cuenta de Google.</small></div>` : '<p class="vacio">Tu carpeta de documentos estará disponible pronto.</p>'}</article>
      </div>`;

    header.after(nav);
    nav.after(inicio);
    main.hidden = true;

    nav.addEventListener('click', e => {
      const tab = e.target.closest('[data-portal-tab]');
      if (!tab) return;
      const proceso = tab.dataset.portalTab === 'proceso';
      inicio.hidden = proceso;
      main.hidden = !proceso;
      nav.querySelectorAll('[data-portal-tab]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
      window.scrollTo({top: 0, behavior: 'instant'});
    });

    // Pendientes: la lista viene del manifest; qué marcó y cuándo, de Supabase.
    const lista = inicio.querySelector('#pendientes-lista');
    let hechos = new Map();
    let aviso = '';

    const pintar = () => {
      if (!pendientes.length) { lista.innerHTML = vacio(TEXTOS.sinPendientes); return; }
      const activos = pendientes.filter(p => !hechos.has(p.id));
      const completados = pendientes.filter(p => hechos.has(p.id)).sort((a, b) => hechos.get(b.id).localeCompare(hechos.get(a.id)));
      lista.innerHTML = (activos.length
        ? `<ul class="lista-pendientes">${activos.map(p => `<li><button type="button" class="check" role="checkbox" aria-checked="false" data-pendiente="${esc(p.id)}" aria-label="Marcar como hecho: ${esc(p.texto)}"></button><span class="pendiente-texto">${esc(p.texto)}${esNuevo(p.agregado) && visitaAnterior ? ' <span class="badge-nuevo">Novedad</span>' : ''}</span></li>`).join('')}</ul>`
        : vacio(TEXTOS.alDia))
        + (completados.length
          ? `<details class="completados"${activos.length ? '' : ' open'}><summary>Completados (${completados.length})</summary><ul class="lista-pendientes">${completados.map(p => `<li><span class="check hecho" aria-hidden="true">✓</span><span class="pendiente-texto"><s>${esc(p.texto)}</s><span class="pendiente-fecha">Completado el ${esc(fechaCorta(hechos.get(p.id)))}</span></span><button type="button" class="deshacer" data-deshacer="${esc(p.id)}">Deshacer</button></li>`).join('')}</ul></details>`
          : '')
        + (aviso ? `<p class="pendiente-aviso" role="status">${aviso}</p>` : '');
    };

    async function guardar(id, hecho) {
      const s = await sesion();
      if (!s) throw new Error('sesion');
      const r = hecho
        ? await api('/rest/v1/pendientes_hechos', {method: 'POST', token: s.access_token, headers: {Prefer: 'return=minimal'}, body: JSON.stringify({pendiente_id: id})})
        : await api(`/rest/v1/pendientes_hechos?pendiente_id=eq.${encodeURIComponent(id)}`, {method: 'DELETE', token: s.access_token});
      if (!r.ok && r.status !== 409) throw new Error('guardar');
    }

    inicio.addEventListener('click', e => {
      const cerrar = e.target.closest('[data-cerrar-aviso]');
      if (cerrar) { local.set('easyeats-aviso-inicio', 'cerrado'); cerrar.closest('.aviso-inicio').remove(); return; }

      const video = e.target.closest('[data-video]');
      if (video) {
        const id = idYoutube(video.dataset.video);
        if (!id) return;
        const marco = document.createElement('iframe');
        marco.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
        marco.title = video.getAttribute('aria-label');
        marco.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        marco.referrerPolicy = 'strict-origin-when-cross-origin';
        marco.allowFullscreen = true;
        video.replaceWith(marco);
        return;
      }

      const marcar = e.target.closest('[data-pendiente]');
      const deshacer = e.target.closest('[data-deshacer]');
      if (!marcar && !deshacer) return;
      const id = marcar ? marcar.dataset.pendiente : deshacer.dataset.deshacer;
      const antes = new Map(hechos);
      if (marcar) hechos.set(id, new Date().toISOString()); else hechos.delete(id);
      aviso = '';
      pintar();
      inicio.querySelector('#pendientes-titulo').focus({preventScroll: true});
      guardar(id, !!marcar).catch(() => {
        hechos = antes;
        aviso = 'No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.';
        pintar();
      });
    });

    pintar();
    if (!pendientes.length) return;
    try {
      const s = await sesion();
      const r = s && await api('/rest/v1/pendientes_hechos?select=pendiente_id,completado_en', {token: s.access_token});
      if (!r || !r.ok) throw new Error('leer');
      (await r.json()).forEach(h => hechos.set(h.pendiente_id, h.completado_en));
    } catch {
      aviso = 'Por ahora no pudimos cargar tu avance. Intenta más tarde.';
    }
    pintar();
  }

  window.MiInicio = {montar};
})();
