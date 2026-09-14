// Mejoras visuales del acceso. No toca la autenticación: esa vive en portal.js.
(() => {
  const input = document.getElementById('password');
  const toggle = document.querySelector('.toggle-password');
  if (input && toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    });
    // Nunca dejar la contraseña visible después de enviar.
    document.getElementById('login-form')?.addEventListener('submit', () => {
      input.type = 'password';
      toggle.setAttribute('aria-pressed', 'false');
      toggle.setAttribute('aria-label', 'Mostrar contraseña');
    });
  }

  // portal.js desactiva el botón mientras valida; lo anunciamos como ocupado.
  const submit = document.querySelector('#login-form .login-submit');
  if (submit) {
    new MutationObserver(() => submit.setAttribute('aria-busy', String(submit.disabled)))
      .observe(submit, {attributes: true, attributeFilter: ['disabled']});
  }
})();
