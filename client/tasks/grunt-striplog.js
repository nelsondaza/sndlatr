/**
 * Based on html2js by the AngularUI/bootstrap team:
 * https://angular-ui.github.com/bootstrap
 * Updated to Grunt ~0.4.0 by Josh David Miller
 *
 * Licensed MIT
 */
module.exports = function(grunt) {


  grunt.registerMultiTask('striplog', 'Remove angular $log.XX() calls',
    function() {
      var options = this.options();
      var strip = options.strip || ['info', 'debug'];
      this.files.forEach(function(file) {
        var inSrc = file.src.filter(function(filepath) {
          // Warn on and remove invalid source files (if nonull was set).
          if (!grunt.file.exists(filepath)) {
            grunt.log.warn('Source file "' + filepath + '" not found.');
            return false;
          } else {
            return true;
          }
        }).map(grunt.file.read)
          .join(grunt.util.normalizelf(grunt.util.linefeed));

        var stripRe = strip.map(function(word) {
          return '(' + word + ')'
        }).join('|');
        var re = new RegExp('\\$log\\.(' + stripRe + ')\\([^;]+;', 'g');
        grunt.log.debug('stripping with RegExp: ' + re);
        var outSrc = inSrc.replace(re, '');
        grunt.file.write(file.dest, outSrc);
        grunt.log.writeln('Annotated file ' + file.dest);
      });

    });
};
