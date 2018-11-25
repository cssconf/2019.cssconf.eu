const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const wordwrap = require('wordwrap')(80);
const chalk = require('chalk');
const program = require('commander');
const {promisify} = require('util');
const {getSheetData} = require('./spreadsheet-api');
const {processSheet, simplifySpreadsheetData} = require('./spreadsheet-utils');
const rimraf = promisify(require('rimraf'));
const mkdirp = require('mkdirp');
const {downloadImage} = require('./image-download');

const timeout = promisify(setTimeout);

// spreadsheet-format is illustrated here:
//   https://docs.google.com/spreadsheets/d/14TQHTYePS0SAaXGRNF3zYXvvk8xz25CXW-uekQy4HAs/edit

program
  .description(
    'import speaker- and talk-data from the specified spreadheet and ' +
      'update the files in contents/speakers and contents/talks'
  )
  .arguments('<spreadsheet>')
  .action(spreadsheet => {
    const rxSpreadsheetIdFromUrl = /^https:\/\/docs\.google\.com\/.*\/d\/([^/]+).*$/;

    program.spreadsheetId = spreadsheet;

    if (rxSpreadsheetIdFromUrl.test(spreadsheet)) {
      program.spreadsheetId = spreadsheet.replace(rxSpreadsheetIdFromUrl, '$1');
    }
  })
  .option(
    '-p --production',
    "run in production-mode (don't import unpublished items)"
  )
  .option('-i --image-path <imagePath>', 'alternative path to look for images')
  .option('-C --no-cleanup', "don't run cleanup before import")
  .parse(process.argv);

const contentRoot = path.resolve(__dirname, '../../contents');
const sheetParams = {
  artists: {
    templateGlobals: {},
    dataFieldName: 'artist',
    contentPath: 'artists'
  },
  schedule: {
    templateGlobals: {},
    dataFieldName: 'schedule',
    contentPath: 'schedule'
  },
  speakers: {
    templateGlobals: {
      template: 'pages/speaker.html.njk'
    },
    dataFieldName: 'speaker',
    contentPath: 'speakers'
  },
  sponsors: {
    templateGlobals: {},
    dataFieldName: 'sponsor',
    contentPath: 'sponsors'
  },
  talks: {
    templateGlobals: {},
    dataFieldName: 'talk',
    contentPath: 'talks'
  },
  team: {
    templateGlobals: {},
    dataFieldName: 'team',
    contentPath: 'team'
  },
};

const wwwtfrcFile = __dirname + '/../../.wwwtfrc';
const hasRcFile = fs.existsSync(wwwtfrcFile);

let rcFileParams = {};
if (hasRcFile) {
  rcFileParams = JSON.parse(fs.readFileSync(wwwtfrcFile));
}

const params = {
  ...rcFileParams,
  imagePath: program.imagePath,
  doCleanup: program.cleanup,
  publishedOnly: program.production || process.env.NODE_ENV === 'production'
};
if (program.spreadsheetId) {
  params.spreadsheetId = program.spreadsheetId;
}

if (!params.spreadsheetId) {
  console.log(
    chalk.red.bold('A spreadsheet-id (or spreadsheet-url) is required.')
  );
  program.outputHelp();
  process.exit(1);
}

if (!hasRcFile) {
  console.log('saving settings to', chalk.green('.wwwtfrc'));
  fs.writeFileSync(
    wwwtfrcFile,
    JSON.stringify({spreadsheetId: params.spreadsheetId}, null, 2)
  );
}

main(params).catch(err => console.error(err));

async function main(params) {
  // ---- ensure the directories exist...
  const requiredDirectories = ['artists', 'schedule', 'speakers', 'sponsors', 'talks', 'team', 'images/artist', 'images/speaker', 'images/sponsor', 'images/team'];
  const requiredDirectoryPaths = requiredDirectories.map(
    dir => `${__dirname}/../../contents/${dir}`
  );
  const missingDirectories = requiredDirectoryPaths.filter(
    dir => !fs.existsSync(dir)
  );

  if (!!missingDirectories.length) {
    console.log(chalk.gray('creating missing directories...'));
    missingDirectories.forEach(dir => mkdirp(dir));
  }

  // ---- cleanup...
  if (params.doCleanup) {
    console.log(chalk.gray('cleaning up...'));

    await Promise.all([rimraf(path.join(contentRoot, '{artists,schedule,speakers,sponsors,talks,team}/*md'))]);
  }

  // ---- fetch spreadsheet-data...
  console.log(chalk.gray('loading spreadsheet data...'));
  const sheets = simplifySpreadsheetData(
    await getSheetData(params.spreadsheetId, {
      readonly: true,

      async beforeOpenCallback(url) {
        console.log(
          chalk.white(
            '\n\n🔐  You first need to grant access to your ' +
              'google-spreadsheets to this program.\n  An ' +
              'authorization-dialog will be ' +
              'opened in your browser in 5 seconds.\n\n'
          ),
          chalk.blue.underline(url)
        );

        return await timeout(5000);
      }
    })
  );

  // ---- parse and generate markdown-files
  console.log(chalk.gray('awesome, that worked.'));
  Object.keys(sheets).forEach(sheetId => {
    if (!sheetId) {
      // Published pages create unnamed sheets.
      return;
    }
    if (!sheetParams[sheetId]) {
      console.log(chalk.red('Missing metadata for'), sheetId);
      return;
    }
    const {templateGlobals, dataFieldName, contentPath} = sheetParams[sheetId];
    const records = processSheet(sheets[sheetId]);

    console.log(chalk.white('processing sheet %s'), chalk.yellow(sheetId));
    records
      // filter unpublished records when not in dev-mode.
      .filter(r => r.published || !params.publishedOnly)
      // render md-files
      .forEach(async function(record) {
        const filename = path.join(contentRoot, contentPath, `${record.id}.md`);

        const {content = '', ...data} = record;
        let title = '';

        if (sheetId === 'speakers') {
          title = `${data.name}: ${data.talkTitle}`;
        }

        if (sheetId === 'artists') {
          title = `${data.firstname} ${data.lastname}: ${data.talkTitle}`;
        }

        if (sheetId === 'team') {
          title = `${data.firstname} ${data.lastname}`;
        }

        let imageExtension = null;
        if (sheetId === 'sponsors') {
          imageExtension = 'svg';
          title = `${data.name}`;
        }
        const imageUrl = data.potraitImageUrl || data.logoUrl;
        data.image = await downloadImage(imageUrl, title, imageExtension);

        const frontmatter = yaml.safeDump({
          ...templateGlobals,
          title,
          [dataFieldName]: data
        });

        console.log(
          ' --> write markdown %s',
          chalk.green(path.relative(process.cwd(), filename))
        );

        try {
          const markdownContent =
            '----\n\n' +
            '# THIS FILE WAS GENERATED AUTOMATICALLY.\n' +
            '# CHANGES MADE HERE WILL BE OVERWRITTEN.\n\n' +
            frontmatter.trim() +
            '\n\n----\n\n' +
            wordwrap(content || '');

          fs.writeFileSync(filename, markdownContent);
        } catch (err) {
          console.error('whoopsie', err);
        }
      });
  });
}

