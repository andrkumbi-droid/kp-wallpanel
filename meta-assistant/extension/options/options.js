const $ = id => document.getElementById(id);
chrome.storage.sync.get(['backendUrl', 'token', 'lang']).then(v => {
  $('backendUrl').value = v.backendUrl || '';
  $('token').value = v.token || '';
  $('lang').value = v.lang || 'de';
});
$('save').onclick = async () => {
  await chrome.storage.sync.set({
    backendUrl: $('backendUrl').value.trim(),
    token: $('token').value.trim(),
    lang: $('lang').value
  });
  $('status').textContent = '✓ gespeichert';
  setTimeout(() => $('status').textContent = '', 2000);
};
