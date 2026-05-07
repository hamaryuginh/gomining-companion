const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const isOnSite = tab?.url?.startsWith('https://app.gomining.com/');

  if (isOnSite) {
    dot.classList.add('active');
    statusText.textContent = 'Actif sur GoMining ✓';
  } else {
    statusText.textContent = 'Naviguez sur app.gomining.com';
  }
});
