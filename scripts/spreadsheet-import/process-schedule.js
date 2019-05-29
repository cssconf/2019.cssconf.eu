const fs = require('fs');
const slug = require('slug');
const scheduleDataPath = './contents/schedule-data.json';

function buildTrack({ track, who, what, time }) {
  return {
    track,
    trackId: Boolean(track) ? slug(track, { lower: true }) : undefined,
    startTime: time,
    dateTime: `2019-05-31 ${time} GMT+0200`,
    who,
    what
  };
}

function getColumn(item, name) {
  const columns = [
    'order',
    'id',
    'published',
    'time',
    'title',
    'bipocitSpace',
    'bipocitSpaceSpeaker',
    'bipocitSpaceLink',
    'communityLounge',
    'communityLoungeLink',
    'liveJsStage',
    'gdcfpDay',
    'misc',
    'excluded',
    'globalEvent',
    'speaker',
    'isTalk',
    '// startTime',
    '// duration',
    '// id from title'
  ];

  const columnIndex = columns.indexOf(name);

  if (columnIndex === -1) {
    return;
  }

  return item[columnIndex];
}

function getSchedule(scheduleData) {
  const schedule = {};

  scheduleData
    .slice(2)
    .filter(item => !getColumn(item, 'excluded'))
    .forEach(item => {
      const time = getColumn(item, 'time');
      const who = getColumn(item, 'speaker');
      const what = getColumn(item, 'title');
      const bipocitSpace = getColumn(item, 'bipocitSpace');
      const communityLounge = getColumn(item, 'communityLounge');
      const liveJsStage = getColumn(item, 'liveJsStage');
      const globalEvent = Boolean(getColumn(item, 'globalEvent'));

      schedule[time] = [];

      const scheduleItem = schedule[time];
      const track = globalEvent ? undefined : 'Main Stage';

      scheduleItem.push(
        buildTrack({
          track,
          who,
          what,
          time
        })
      );

      if (Boolean(bipocitSpace)) {
        scheduleItem.push(
          buildTrack({
            track: 'BIPoCiT Space',
            who: getColumn(item, 'bipocitSpaceSpeaker'),
            what: bipocitSpace,
            time
          })
        );
      }

      if (Boolean(communityLounge)) {
        scheduleItem.push(
          buildTrack({
            track: 'Community Lounge',
            who: undefined,
            what: communityLounge,
            time
          })
        );
      }

      if (Boolean(liveJsStage)) {
        scheduleItem.push(
          buildTrack({
            track: 'Live:JS Stage',
            who: undefined,
            what: liveJsStage,
            time
          })
        );
      }
    });

  return schedule;
}

function processSchedule(sheet) {
  const schedule = {
    info: { generationTime: new Date().toString() },
    schedule: getSchedule(sheet)
  };

  fs.writeFileSync(
    scheduleDataPath,
    JSON.stringify(
      {
        pageId: 'scheduleJson',
        template: 'pages/json.html.njk',
        filename: ':file.json',
        actualJson: schedule
      },
      null,
      '  '
    )
  );
}

module.exports = {
  processSchedule,
  scheduleDataPath
};
