// Theme synchronization with extension (optional)
const ThemeManager = {
  THEMES: {
    DARK: 'dark',
    LIGHT: 'light',
    SYSTEM: 'system'
  },

  init() {
    // Check localStorage first
    const savedTheme = localStorage.getItem('holyTheme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else {
      // Check system preference
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(systemDark ? this.THEMES.DARK : this.THEMES.LIGHT);
    }

    // Listen for system changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const currentTheme = localStorage.getItem('holyTheme');
      if (!currentTheme || currentTheme === this.THEMES.SYSTEM) {
        this.setTheme(e.matches ? this.THEMES.DARK : this.THEMES.LIGHT);
      }
    });
  },

  setTheme(theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    
    if (theme === this.THEMES.LIGHT) {
      document.body.classList.add('light-theme');
      localStorage.setItem('holyTheme', this.THEMES.LIGHT);
    } else {
      // Dark is default
      localStorage.setItem('holyTheme', this.THEMES.DARK);
    }
  },

  getCurrentTheme() {
    return document.body.classList.contains('light-theme') ? this.THEMES.LIGHT : this.THEMES.DARK;
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  if (window.ThemeManager) {
    window.ThemeManager.init();
  } else {
    ThemeManager.init();
  }
});