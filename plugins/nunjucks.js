const nunjucks = require('nunjucks');
const path = require('path');
const minify = require('html-minifier').minify;
const fs = require('fs');
const imageSize = require('image-size');
const {
  scheduleDataPath
} = require('../scripts/spreadsheet-import/process-schedule');

module.exports = function(env, callback) {
  const optionDefaults = {
    autoescape: false,
    filterdir: process.cwd(),
    filters: [],
    filtermodules: [],
    extensions: {}
  };

  env.config.locals.loadSchedule = function(contents) {
    if (!fs.existsSync(scheduleDataPath)) {
      console.error('Error: Schedule file was not generated.');
      return null;
    }
    return JSON.parse(fs.readFileSync(scheduleDataPath)).actualJson;
  };

  env.config.locals.filterSessionsByTrackId = function(sessions, trackId) {
    return sessions.filter(
      session => Boolean(session.trackId) && session.trackId === trackId
    );
  };

  env.config.locals.filterTeamByResponsibility = function(
    teamMembers,
    responsibility
  ) {
    return teamMembers.filter(teamMember =>
      teamMember.metadata.team.tags.includes(responsibility)
    );
  };

  env.config.locals.Date = Date;

  // Load the new nunjucks environment.
  const loaderOpts = {
    watch: env.mode === 'preview'
  };
  const loader = new nunjucks.FileSystemLoader(env.templatesPath, loaderOpts);
  const nenv = new nunjucks.Environment(loader);

  // Load the filters
  const options = Object.assign({}, optionDefaults, env.config.nunjucks);

  options.filters.map(function(name) {
    const file = path.join(options.filterdir, name + '.js');
    const filter = env.loadModule(env.resolvePath(file), true);
    nenv.addFilter(name, filter);
  });

  options.filtermodules.map(function(name) {
    const filter = require(name);
    filter.install(nenv);
  });

  // Set globals
  nenv.addGlobal('cacheBuster', Date.now());

  Object.keys(options.extensions).map(extName => {
    const file = options.extensions[extName];
    const extension = env.loadModule(env.resolvePath(file), true);

    nenv.addExtension(extName, extension);
  });

  nenv.opts.autoescape = options.autoescape;

  class NunjucksTemplate extends env.TemplatePlugin {
    constructor(template) {
      super();
      this.template = template;
    }

    render(locals, callback) {
      try {
        let html = this.template.render(locals);
        if (!html) {
          throw new Error('Template render failed' + this.filename);
        }
        html = minify(html, {
          removeAttributeQuotes: true,
          collapseWhitespace: true,
          removeComments: true,
          sortClassName: true,
          sortAttributes: true
        });
        callback(null, new Buffer(html));
      } catch (error) {
        callback(error);
      }
    }

    static fromFile(filepath, callback) {
      callback(null, new NunjucksTemplate(nenv.getTemplate(filepath.relative)));
    }
  }

  // Transform static URLs into the form:
  // /immutable/$fileHash/filename
  env.plugins.StaticFile.prototype.getFilename = function getFilename() {
    // Top level files such as CNAME and manifest.json should not be renamed.
    if (!/\//.test(this.filepath.relative)) {
      return this.filepath.relative;
    }
    const hash = require('crypto').createHash('sha1');
    hash.update(require('fs').readFileSync(this.filepath.full), 'utf8');
    return 'immutable/' + hash.digest('hex') + '/' + this.filepath.relative;
  };
  env.plugins.StaticFile.prototype.getImageInfo = function() {
    if (this.imageInfo_) {
      return this.imageInfo_;
    }
    this.imageInfo_ = {};
    const buffer = fs.readFileSync(this.filepath.full);
    const size = imageSize(buffer);
    this.imageInfo_.width = size.width;
    this.imageInfo_.height = size.height;
    this.imageInfo_.aspectPercentage = Math.round(
      size.height / size.width * 100
    );
    return this.imageInfo_;
  };

  env.registerTemplatePlugin('**/*.*(html|nunjucks|njk)', NunjucksTemplate);
  callback();
};
