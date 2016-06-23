// Import the page-mod API
var pageMod = require('sdk/page-mod');
var self = require('sdk/self');

// Create a page mod
// It will run the injection script on Gmail only.
pageMod.PageMod({
  attachTo: ['existing', 'top'],
  contentScriptWhen: 'ready',
  include: ['https://mail.google.com/*', 'http://mail.google.com/*'],
  contentScriptFile: self.data.url('inject.js')
});
