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
const fetch = require('node-fetch');
const imageType = require('image-type');
const imageSize = require('image-size');
const mkdirp = require('mkdirp');

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
          data.image = getLocalSpeakerImage(data);
          title = `${data.name}: ${data.talkTitle}`;
          if (!data.image) {
            try {
              data.image = await downloadSpeakerImage(data);
            } catch (err) {
              console.error('this is bad: ', err);
            }
          }
          delete data.potraitImageUrl;
        }

        if (sheetId === 'artists') {
          data.image = getLocalArtistImage(data);
          title = `${data.firstname} ${data.lastname}: ${data.talkTitle}`;
          if (!data.image) {
            try {
              data.image = await downloadArtistImage(data);
            } catch (err) {
              console.error('this is bad: ', err);
            }
          }
          delete data.potraitImageUrl;
        }

        if (sheetId === 'team') {
          data.image = getLocalTeamImage(data);
          title = `${data.firstname} ${data.lastname}`;
          if (!data.image) {
            try {
              data.image = await downloadTeamImage(data);
            } catch (err) {
              console.error('this is bad: ', err);
            }
          }
          delete data.potraitImageUrl;
        }

        if (sheetId === 'sponsors') {
          data.image = getLocalSponsorImage(data);
          if (!data.image) {
            try {
              data.image = await downloadSponsorImage(data);
            } catch (err) {
              console.error('this is bad: ', err);
            }
          }
          delete data.logoUrl;
        }

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

function getLocalSponsorImage(sponsor) {
  if (!params.imagePath) {
    return null;
  }

  const filename = getImageFilename(sponsor, 'svg');
  const srcFilename = path.join(params.imagePath, filename);
  const destFilename = path.join('contents/images/sponsor', filename);

  if (fs.existsSync(srcFilename)) {
    console.log(` --> image found in image-path:`, filename);
    const buffer = fs.readFileSync(srcFilename);
    fs.writeFileSync(destFilename, buffer);

    return {
      filename
    };
  }

  return null;

}

function getLocalSpeakerImage(speaker) {
  if (!params.imagePath) {
    return null;
  }

  const filename = getImageFilename(speaker, 'jpg');
  const srcFilename = path.join(params.imagePath, filename);
  const destFilename = path.join('contents/images/speaker', filename);

  if (fs.existsSync(srcFilename)) {
    console.log(` --> image found in image-path:`, filename);
    const buffer = fs.readFileSync(srcFilename);
    const size = imageSize(buffer);
    fs.writeFileSync(destFilename, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  }

  return null;
}

function getLocalArtistImage(speaker) {
  if (!params.imagePath) {
    return null;
  }

  const filename = getImageFilename(speaker, 'jpg');
  const srcFilename = path.join(params.imagePath, filename);
  const destFilename = path.join('contents/images/artist', filename);

  if (fs.existsSync(srcFilename)) {
    console.log(` --> image found in image-path:`, filename);
    const buffer = fs.readFileSync(srcFilename);
    const size = imageSize(buffer);
    fs.writeFileSync(destFilename, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  }

  return null;
}

async function downloadArtistImage(artist) {
  const url = artist.potraitImageUrl;
  console.log('downloadImage', url);
  if (!url) {
    console.error(chalk.yellow('no image specified for ' + artist.id));
    return {};
  }

  try {
    const res = await fetch(url);

    if (!res.headers.get('content-type').startsWith('image')) {
      console.error(chalk.red.bold(' !!! url is not an image', url));
      return {};
    }

    const buffer = await res.buffer();

    const info = imageType(buffer);
    if (!info) {
      console.error(chalk.red.bold(' !!! no type-imformation for image', url));
      return {};
    }

    const size = imageSize(buffer);
    const filename = getImageFilename(artist, info.ext);
    const fullPath = 'contents/images/artist/' + filename;

    console.info(' --> image downloaded ', chalk.green(fullPath));
    fs.writeFileSync(fullPath, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  } catch (err) {
    console.error(chalk.red.bold(' !!! failed to download', url));
    console.error(err);
    return {};
  }
}

function getLocalTeamImage(team) {
  if (!params.imagePath) {
    return null;
  }

  const filename = getTeamFilename(team, 'jpg');
  const srcFilename = path.join(params.imagePath, filename);
  const destFilename = path.join('contents/images/team', filename);

  if (fs.existsSync(srcFilename)) {
    console.log(` --> image found in image-path:`, filename);
    const buffer = fs.readFileSync(srcFilename);
    const size = imageSize(buffer);
    fs.writeFileSync(destFilename, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  }

  return null;
}

async function downloadTeamImage(team) {
  const url = team.potraitImageUrl;
  console.log('downloadImage', url);
  if (!url) {
    console.error(chalk.yellow('no image specified for ' + team.id));
    return {};
  }

  try {
    const res = await fetch(url);

    if (!res.headers.get('content-type').startsWith('image')) {
      console.error(chalk.red.bold(' !!! url is not an image', url));
      return {};
    }

    const buffer = await res.buffer();

    const info = imageType(buffer);
    if (!info) {
      console.error(chalk.red.bold(' !!! no type-imformation for image', url));
      return {};
    }

    const size = imageSize(buffer);
    const filename = getImageFilename(team, info.ext);
    const fullPath = 'contents/images/team/' + filename;

    console.info(' --> image downloaded ', chalk.green(fullPath));
    fs.writeFileSync(fullPath, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  } catch (err) {
    console.error(chalk.red.bold(' !!! failed to download', url));
    console.error(err);
    return {};
  }
}

async function downloadSponsorImage(sponsor) {
  const url = sponsor.logoUrl;
  console.log('downloadImage', url);
  if (!url) {
    console.error(chalk.yellow('no image specified for ' + sponsor.id));
    return {};
  }

  try {
    const res = await fetch(url);

    if (!res.headers.get('content-type').startsWith('image')) {
      console.error(chalk.red.bold(' !!! url is not an image', url));
      return {};
    }

    const buffer = await res.buffer();

    const filename = getImageFilename(sponsor, 'svg');
    const fullPath = 'contents/images/sponsor/' + filename;

    console.info(' --> image downloaded ', chalk.green(fullPath));
    fs.writeFileSync(fullPath, buffer);

    return {
      filename
    };
  } catch (err) {
    console.error(chalk.red.bold(' !!! failed to download', url));
    console.error(err);
    return {};
  }
}

async function downloadSpeakerImage(speaker) {
  const url = speaker.potraitImageUrl;
  console.log('downloadImage', url);
  if (!url) {
    console.error(chalk.yellow('no image specified for ' + speaker.id));
    return {};
  }

  try {
    const res = await fetch(url);

    if (!res.headers.get('content-type').startsWith('image')) {
      console.error(chalk.red.bold(' !!! url is not an image', url));
      return {};
    }

    const buffer = await res.buffer();

    const info = imageType(buffer);
    if (!info) {
      console.error(chalk.red.bold(' !!! no type-imformation for image', url));
      return {};
    }

    const size = imageSize(buffer);
    const filename = getImageFilename(speaker, info.ext);
    const fullPath = 'contents/images/speaker/' + filename;

    console.info(' --> image downloaded ', chalk.green(fullPath));
    fs.writeFileSync(fullPath, buffer);

    return {
      filename,
      width: size.width,
      height: size.height
    };
  } catch (err) {
    console.error(chalk.red.bold(' !!! failed to download', url));
    console.error(err);
    return {};
  }
}

function getImageFilename(data, ext) {
  let filename = data.id;

  return filename + '.' + ext;
}
