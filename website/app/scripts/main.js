'use strict';
(function($, win) {
  var btnEl = $('#install_button');

  function showNotSupported() {
    btnEl.hide();
    $('#unsupported_browser').show();
  }

  function initInstallButton() {
    var firefoxUrl = 'https://storage.googleapis.com/www.sndlatr.com/sndlatr.xpi';
    var chromeUrl = 'https://chrome.google.com/webstore/detail/sndlatr-beta-for-gmail/nfddgbpdnaeliohhkbdbcmenpnkepkgn';
    var ua = win.navigator.userAgent;
    if (ua.indexOf('Android') >= 0 || ua.indexOf('iPhone') >= 0) {
      showNotSupported();
    } else if (window.chrome) {
      btnEl.attr('href', chromeUrl);
    } else if (ua.indexOf('Firefox') >= 0) {
      btnEl.attr('href', firefoxUrl);
    } else {
      showNotSupported(btnEl);
    }
  }

  function setActiveNav() {
    var path = win.location.pathname;
    $('#main_nav').find('li').each(function(idx, liEl) {
      liEl = $(liEl);
      var href = liEl.find('a').attr('href');
      if (path == href) {
        liEl.addClass('active');
      }
    });
  }

  var navHeight = $('.navbar').outerHeight(true) + 10;
  $('body').scrollspy({ target: '.bs-sidebar', offset: navHeight });


  initInstallButton();
  setActiveNav();
})(window.jQuery, window);

