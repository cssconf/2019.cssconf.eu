const fs = require('fs');
const slug = require('slug');
const scheduleDataPath = './contents/schedule-data.json';

function buildTrack({ track, who, what, time }) {
  return {
    track,
    trackId: Boolean(track) ? slug(track, { lower: true }) : null,
    startTime: time,
    dateTime: `2019-05-31 ${time} GMT+0200`,
    who,
    what
  };
}

function getSchedule(scheduleData) {
  const schedule = {};

  scheduleData
    .slice(2)
    .filter(item => !item[11]) // Filter out buffers
    .forEach(item => {
      const time = item[3];
      const who = item[13];
      const what = item[4];
      const bipocitSpace = item[5];
      const communityLounge = item[8];
      const globalEvent = Boolean(item[12]);

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
            who: item[6],
            what: bipocitSpace,
            time
          })
        );
      }

      if (Boolean(communityLounge)) {
        scheduleItem.push(
          buildTrack({
            track: 'Community Lounge',
            who: null,
            what: communityLounge,
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
