(function initSidebarResize() {
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !sidebar) return;

  const MIN_WIDTH    = 200;
  const MAX_WIDTH    = 480;
  const STORAGE_KEY  = 'sidebarWidth';

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) sidebar.style.width = saved + 'px';

  let startX, startWidth;

  resizer.addEventListener('mousedown', e => {
    startX     = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'col-resize';

    function onMouseMove(e) {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)));
      sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      resizer.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
      localStorage.setItem(STORAGE_KEY, parseInt(sidebar.style.width));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  });
})();