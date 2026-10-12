// Applies the saved appearance (Light or Dark) and theme (Orange, Charcoal,
// Galaxy; Mono is the default) before the page is drawn, so
// there is no flash of the wrong colours. System needs nothing: CSS follows the phone.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('nasrin.theme'));
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    var c = JSON.parse(localStorage.getItem('nasrin.palette'));
    if (c === 'orange' || c === 'charcoal' || c === 'galaxy') document.documentElement.setAttribute('data-palette', c);
    if (JSON.parse(localStorage.getItem('nasrin.tabbar')) === true) document.documentElement.setAttribute('data-tabbar', 'on');
    if (JSON.parse(localStorage.getItem('nasrin.motion')) === 'reduce') document.documentElement.setAttribute('data-motion', 'reduce');
  } catch (e) { /* private mode: follow the phone */ }
})();
