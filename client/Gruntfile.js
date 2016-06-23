// Generated on 2013-08-07 using generator-angular 0.3.1
'use strict';
var LIVERELOAD_PORT = 35729;
var lrSnippet = require('connect-livereload')({ port: LIVERELOAD_PORT });
var mountFolder = function(connect, dir) {
  return connect.static(require('path').resolve(dir));
};

// # Globbing
// for performance reasons we're only matching one level down:
// 'test/spec/{,*/}*.js'
// use this if you want to recursively match all subfolders:
// 'test/spec/**/*.js'

/**
 * Proxy api requests to GAE Server
 */
function proxyRequest(host, port) {
  var httpProxy = require('http-proxy');
  var proxy = new httpProxy.RoutingProxy();
  var options = {
    host: host, port: port
  };
  return function(req, res, next) {
    if (/^\/(api|_ah)\//.test(req.url)) {
      console.log('proxying request ' + req.url);
      proxy.proxyRequest(req, res, options);
    } else {
      next();
    }
  };
}

module.exports = function(grunt) {
  // load all grunt tasks
  require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);
  grunt.loadTasks('tasks');


  // configurable paths
  var yeomanConfig = {
    app: 'app',
    dist: 'dist',
    jsdist: 'dist/static'
  };

  try {
    yeomanConfig.app = require('./bower.json').appPath || yeomanConfig.app;
  } catch (e) {
  }

  grunt.initConfig({
      yeoman: yeomanConfig,
      iife: {
        before: '(function () {\n',
        after: '\n}());'
      },
      src: {
        libs: [
          '<%= yeoman.app %>/components/sugarjs/sugar.min.js',
          '<%= yeoman.app %>/components/angular/angular.min.js',
          '<%= yeoman.app %>/components/ui-bootstrap/ui-bootstrap.min.js',
          '<%= yeoman.app %>/bower_components/underscore/underscore-min.js'
        ],
        js: [
          // includes generated templates
          '{.tmp,<%= yeoman.app %>}/scripts/**/*.js',
          '!<%= yeoman.app %>/scripts/sndlatr/constantsProductive.js',
          '<%= yeoman.app %>/scripts/sndlatr/constantsProductive.js',
          '!<%= yeoman.app %>/scripts/bootstrap.js',
          '<%= yeoman.app %>/scripts/bootstrap.js'
        ],
        atpl: '<%= yeoman.app %>/{views,template}/**/*.html',
        all: [
          '<%= yeoman.app %>/scripts/**/*.js',
          '<%= yeoman.app %>/**/*.html',
          '<%= yeoman.app %>/styles/**/*.{scss,sass}',
          '<%= yeoman.app %>/images/*.{gif,png,jpg,jpeg}'
        ]
      },

      watch: {
        compass: {
          files: ['<%= yeoman.app %>/styles/{,*/}*.{scss,sass}'],
          tasks: ['compass:server']
        },
        client: {
          files: ['{.tmp,<%= yeoman.app %>}/scripts/**/*.js'],
          tasks: ['concat:client']
        },
        html2js: {
          files: '<%= src.atpl %>',
          tasks: ['html2js']
        },
        livereload: {
          options: {
            livereload: LIVERELOAD_PORT
          },
          files: [
            '.tmp/client.js',
            '{.tmp,<%= yeoman.app %>}/styles/{,*/}*.css',
            // '<%= yeoman.app %>/{,*/}*.html',
            // '{.tmp,<%= yeoman.app %>}/scripts/{,*/}*.js',
            '<%= yeoman.app %>/images/{,*/}*.{png,jpg,jpeg,gif,webp,svg}'
          ]
        }
      },
      html2js: {
        options: {
          base: '<%= yeoman.app %>'
        },
        app: {
          src: '<%= src.atpl %>',
          dest: '.tmp/scripts/app.tpl.js'
        }
      },
      connect: {
        options: {
          port: 9000,
          protocol: 'http',
          // Change this to '0.0.0.0' to access the server from outside.
          hostname: 'localhost'
          // key: grunt.file.read('server.key').toString(),
          // cert: grunt.file.read('server.crt').toString(),
          // ca: grunt.file.read('ca.crt').toString(),
          // passphrase: 'local'
        },
        livereload: {
          options: {
            middleware: function(connect) {
              return [
                lrSnippet,
                mountFolder(connect, '.tmp'),
                mountFolder(connect, yeomanConfig.app),
                proxyRequest('localhost', 8080)
              ];
            }
          }
        },
        test: {
          options: {
            middleware: function(connect) {
              return [
                mountFolder(connect, '.tmp'),
                mountFolder(connect, 'test'),
                proxyRequest('localhost', 8080)
              ];
            }
          }
        },
        dist: {
          options: {
            middleware: function(connect) {
              return [
                mountFolder(connect, yeomanConfig.dist),
                proxyRequest('localhost', 8080)
              ];
            }
          }
        }
      },
      open: {
        server: {
          url: 'http://localhost:<%= connect.options.port %>'
        }
      },
      clean: {
        dist: {
          files: [
            {
              dot: true,
              src: [
                '.tmp',
                '<%= yeoman.dist %>/*',
                '!<%= yeoman.dist %>/.git*'
              ]
            }
          ]
        },
        server: '.tmp'
      },
      jshint: {
        options: {
          jshintrc: '.jshintrc'
        },
        all: [
          'Gruntfile.js',
          '<%= yeoman.app %>/scripts/**/*.js'
        ]
      },
      // not used since Uglify task does concat,
      // but still available if needed
      concat: {
        client: {
          src: [
            '<%= src.libs %>',
            '<%= src.js %>',
            '!<%= yeoman.app %>/scripts/sndlatr/constantsProductive.js'
          ],
          dest: '.tmp/client.js'
        },
        preparedist: {
          files: {
            '.tmp/thinclient.js': ['<%= src.js %>'
            ]
          }
        },
        dist: {
          options: {
            banner: '<%= iife.before %>',
            footer: '<%= iife.after %>'
          },
          src: [
            '<%= src.libs %>',
            '.tmp/thinclient.js'
          ],
          dest: '<%= yeoman.jsdist %>/scripts/client.js'
        }
      },
      rev: {
        dist: {
          files: {
            src: [
              '<%= yeoman.jsdist %>/scripts/{,*/}*.js',
              '<%= yeoman.jsdist %>/styles/{,*/}*.css',
              '<%= yeoman.jsdist %>/images/{,*/}*.{png,jpg,jpeg,gif,webp,svg}',
              '<%= yeoman.jsdist %>/styles/fonts/*'
            ]
          }
        }
      },
      useminPrepare: {
        html: '<%= yeoman.app %>/*.html',
        options: {
          dest: '<%= yeoman.jsdist %>'
        }
      },
      usemin: {
        html: ['<%= yeoman.jsdist %>/{,*/}*.html'],
        css: ['<%= yeoman.jsdist %>/styles/{,*/}*.css'],
        options: {
          dirs: ['<%= yeoman.jsdist %>']
        }
      },
      imagemin: {
        dist: {
          files: [
            {
              expand: true,
              cwd: '<%= yeoman.app %>/images',
              src: '{,*/}*.{png,jpg,jpeg}',
              dest: '<%= yeoman.jsdist %>/images'
            },

            {
              expand: true,
              cwd: '.tmp/images',
              src: [
                '**/*.{png,jpg,jpeg}'
              ],
              dest: '<%= yeoman.jsdist %>/images'
            }
          ]
        }
      },
      svgmin: {
        dist: {
          files: [
            {
              expand: true,
              cwd: '<%= yeoman.app %>/images',
              src: '{,*/}*.svg',
              dest: '<%= yeoman.jsdist %>/images'
            }
          ]
        }
      },
      cssmin: {
        dist: {
          files: {
            '<%= yeoman.jsdist %>/styles/main.css': [
              '.tmp/styles/main.css'
            ]
          }
        }
      },
      htmlmin: {
        dist: {
          options: {
            /*removeCommentsFromCDATA: true,
             // https://github.com/yeoman/grunt-usemin/issues/44
             //collapseWhitespace: true,
             collapseBooleanAttributes: true,
             removeAttributeQuotes: true,
             removeRedundantAttributes: true,
             useShortDoctype: true,
             removeEmptyAttributes: true,
             removeOptionalTags: true*/
          },
          files: [
            {
              expand: true,
              cwd: '<%= yeoman.app %>',
              src: ['*.html', 'views/*.html'],
              dest: '<%= yeoman.jsdist %>'
            }
          ]
        }
      },
      // Put files not handled in other tasks here
      copy: {
        dist: {
          files: [
            {
              expand: true,
              dot: true,
              cwd: '<%= yeoman.app %>',
              dest: '<%= yeoman.jsdist %>',
              src: [
                '*.{ico,png,txt,xml,info}',
                '.htaccess',
                'images/{,*/}*.{gif,webp}',
                'styles/fonts/*'
              ]
            },
            {
              expand: true,
              cwd: '.tmp/images',
              dest: '<%= yeoman.jsdist %>/images',
              src: [
                'generated/*'
              ]
            },
            // gae:
            {
              expand: true,
              cwd: '../gae/',
              dest: '<%= yeoman.dist %>/',
              src: '**/*'
            }
          ]
        }
      },
      concurrent: {
        server: [
          'html2js',
          'compass:server',
        ],
        test: [
          'html2js',
          'compass'
        ],
        dist: [
          'html2js',
          'compass:dist'
          // 'htmlmin'
        ]
      },
      compass: {
        options: {
          sassDir: '<%= yeoman.app %>/styles',
          cssDir: '.tmp/styles',
          imagesDir: '<%= yeoman.app %>/images',
          javascriptsDir: '<%= yeoman.app %>/scripts',
          fontsDir: '<%= yeoman.app %>/styles/fonts',
          importPath: 'app/components',
          raw: [
            'http_images_path = \'../images\'',
            'generated_images_dir = \'.tmp/images\'',
            'http_generated_images_path = \'../images\'',
            'http_stylesheets_path = \'../styles\'',
            'asset_cache_buster :none'
          ].join('\n'),
          relativeAssets: false
        },
        dist: {},
        server: {
          options: {
            debugInfo: true
          }
        },
        e2e: {
          // options: {
          //   cssDir: '.tmp_e2e/styles'
          // }
        }
      },
      karma: {
        unit: {
          configFile: 'karma.conf.js',
          singleRun: true
        }
      },
      cdnify: {
        dist: {
          html: ['<%= yeoman.jsdist %>/*.html']
        }
      },
      uglify: {
        // options: {
        //   beautify: true,
        //   mangle: true,
        //   compress: true
        // },
        dist: {
          files: {
            '.tmp/thinclient.js': '.tmp/thinclient.js'
          }
        }
      },
      striplog: {
        options: {
          strip: ['info', 'debug']
        },
        dist: {
          files: {
            '.tmp/thinclient.js': '.tmp/thinclient.js'
          }
        }
      },
      compress: {
        tvApp: {
          options: {
            archive: 'packaged/vGetSamsung.zip'
          },
          cwd: '<%= yeoman.jsdist %>',
          expand: true,
          src: [ '**/*' ]
        }
      }
    }
  );

  grunt.registerTask('server', function(target) {
    if (target === 'dist') {
      return grunt.task.run(['build', 'open', 'connect:dist:keepalive']);
    }

    grunt.task.run([
      'clean:server',
      'concurrent:server',
      'concat:client',
      'connect:livereload',
      'watch'
    ]);
  });

  grunt.registerTask('test', [
    'clean:server',
    'concurrent:test',
    'connect:test',
    'karma'
  ]);

  grunt.registerTask('build', [
    'clean:dist',
    'useminPrepare',
    'concurrent:dist',
    'imagemin',
    'svgmin',
    'concat:preparedist',
    'striplog',
    'uglify',
    'concat:dist',
    'copy:dist',
    'cssmin',
    // 'rev',
    'usemin'
    // 'compress'
    // 'copy:gae'
  ]);

  grunt.registerTask('default', [
    'jshint',
    'test',
    'build'
  ]);
};
