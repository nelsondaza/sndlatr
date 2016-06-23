(function() {
  var head = document.getElementsByTagName('head')[0];
  if (!head) {
    window.console.log('no head, no code');
    return;
  }

  function addScript(src) {
    var scriptEl = document.createElement('script');
    scriptEl.type = 'text/javascript';
    scriptEl.src = src;
    head.appendChild(scriptEl);
  }

  function addCss(src) {
    var cssEl = document.createElement('link');
    cssEl.type = 'text/css';
    cssEl.href = src;
    cssEl.rel = 'stylesheet';
    cssEl.media = 'all';
    head.appendChild(cssEl);
  }

  addScript('http://localhost:9000/client.js');
  addCss('http://localhost:9000/styles/main.css');
  addScript('http://localhost:35729/livereload.js?snipver=1');
})();
