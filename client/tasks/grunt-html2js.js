/**
 * Based on html2js by the AngularUI/bootstrap team:
 * https://angular-ui.github.com/bootstrap
 * Updated to Grunt ~0.4.0 by Josh David Miller
 *
 * Licensed MIT
 */
module.exports = function(grunt) {

  // HTML-2-JS Templates
  var path = require('path');
  var TPL = 'angular.module("<%= id %>", []).run(["$templateCache", ' +
    'function($templateCache) {\n' +
    '$templateCache.put("<%= id %>",\n' +
    '"<%= content %>");\n}]);\n';
  var templateModule = "angular.module('templates', [<%= templates %>]);\n";

  function escapeContent(content) {
    return content.replace(/"/g, '\\"').replace(/\r?\n/g, '" +\n    "');
  }

  function normalizePath(p) {
    if (path.sep !== '/') {
      p = p.replace(/\\/g, '/');
    }
    return p;
  }

  grunt.registerMultiTask('html2js', 'Generate js version of html template.',
    function() {
      var templates = [];
      var options = this.options();
      this.files.forEach(function(file) {
        var base = options['base'] || '.';
        var dst = file.dest;
        var cached = [];
        file.src.forEach(function(src) {
          var id = normalizePath(path.relative(base, src));
          templates.push("'" + id + "'");

          cached.push(grunt.template.process(TPL, {
            data: {
              id: id,
              content: escapeContent(grunt.file.read(src))
            }
          }));
        });

        cached.push(grunt.template.process(templateModule, {
          data: {
            templates: templates.join(', ')
          }
        }));
        grunt.log.writeln('Converted templates to js: ' + dst);
        grunt.file.write(path.resolve(dst), cached.join('\n'));
      });

      // grunt.file.write(path.resolve(dest, 'templates.js'),
      //   grunt.template.process(templateModule, {
      //     data: {
      //       templates: templates.join(', ')
      //     }
      //   }));
    });
};
