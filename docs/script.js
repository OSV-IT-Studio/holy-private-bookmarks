document.addEventListener('DOMContentLoaded', function () {
  const burger = document.getElementById('nav-burger');
  const navLinks = document.getElementById('nav-links');
  const themeToggle = document.getElementById('theme-toggle');

  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      burger.classList.toggle('open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (!burger.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const savedTheme = localStorage.getItem('hpb-site-theme');
  const isLight = savedTheme === 'light';
  document.body.classList.toggle('light', isLight);
  updateThemeIcon(isLight);

  themeToggle.addEventListener('click', () => {
    const nowLight = document.body.classList.toggle('light');
    localStorage.setItem('hpb-site-theme', nowLight ? 'light' : 'dark');
    updateThemeIcon(nowLight);
  });

  function updateThemeIcon(light) {
    const svg = themeToggle.querySelector('svg');
    if (light) {
      svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
      svg.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
    }
  }

  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });
});
