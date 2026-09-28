const box = document.querySelector('#enabled');
chrome.storage.sync.get({ enabled: true }, ({ enabled }) => { box.checked = enabled; });
box.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: box.checked });
});
