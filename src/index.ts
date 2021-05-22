import fetch from 'node-fetch';
import objectHash from 'object-hash';

if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  dotenv.config();
}
const { CHAT_ID_18, CHAT_ID_45, BOT_TOKEN, DISTRICT_IDS } = process.env;
const POLLING_INTERVAL = process.env.POLLING_INTERVAL
  ? parseInt(process.env.POLLING_INTERVAL, 10)
  : 15;
const PUBLISH_INTERVAL = process.env.PUBLISH_INTERVAL
  ? parseInt(process.env.PUBLISH_INTERVAL, 10)
  : 15;

const lastMessages: Record<
  string,
  { centerHash: string | null; resultHash: string | null; published: Date }
> = {};

function main() {
  if (!(CHAT_ID_18 || CHAT_ID_45) || !BOT_TOKEN || !DISTRICT_IDS) {
    console.error('Required environment variables not found');
    process.exit(1);
  }

  console.log(`Starting app:${process.env.APP_VERSION || 'dev'}`);
  DISTRICT_IDS.split(',')
    .map((x) => parseInt(x, 10))
    .forEach((districtId) => {
      lastMessages[`${districtId}:18`] = {
        centerHash: null,
        resultHash: null,
        published: new Date(0),
      };
      lastMessages[`${districtId}:45`] = {
        centerHash: null,
        resultHash: null,
        published: new Date(0),
      };
      run(districtId);
    });
}

async function run(districtId: number) {
  try {
    const date = new Date();
    await request(districtId, date);
  } catch (error) {
    console.error(error);
  }
  setTimeout(() => run(districtId), POLLING_INTERVAL * 1000);
}

async function request(districtId: number, dt: Date) {
  const date = `${String(dt.getDate()).padStart(2, '0')}-${String(
    dt.getMonth() + 1
  ).padStart(2, '0')}-${dt.getFullYear()}`;

  const res = await fetch(
    `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${date}`,
    {
      headers: {
        'User-Agent': `vaccine-alert/${process.env.APP_VERSION || 'dev'}`,
      },
    }
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(e);
  }

  const data = await res.json();
  if (!data || !data.centers) {
    return;
  }

  CHAT_ID_18 && processData(districtId, dt, data, 18, CHAT_ID_18);
  CHAT_ID_45 && processData(districtId, dt, data, 45, CHAT_ID_45);
}

async function processData(
  districtId: number,
  dt: Date,
  data: { centers: Center[] },
  min_age: 18 | 45,
  chat_id: string
) {
  const key = `${districtId}:${min_age}`;
  const availableCenters = getSlots(data.centers, min_age);
  if (availableCenters.length === 0) {
    lastMessages[key] = { ...lastMessages[key], centerHash: null };
    return;
  }

  const centerHash = hashCenters(availableCenters);
  const resultHash = objectHash(availableCenters);
  const {
    centerHash: lastCenterHash,
    resultHash: lastResultHash,
    published: lastPublished,
  } = lastMessages[key];

  console.log(
    `${dt.toLocaleString()} District: ${districtId}/${min_age} Centers: ${
      availableCenters.length
    } Doses: ${availableCenters
      .map(({ sessions }) =>
        sessions.map(({ available_capacity }) => available_capacity)
      )
      .flat()
      .reduce((a, x) => a + x, 0)}`
  );

  const shouldPublish =
    lastCenterHash !== centerHash ||
    (lastResultHash !== resultHash &&
      dt.getTime() - lastPublished.getTime() > 1000 * 60 * PUBLISH_INTERVAL);

  if (shouldPublish) {
    const msg = makeMessage(availableCenters);
    await postMessage(msg, `@${chat_id}`);
    const published = new Date();
    lastMessages[key] = { centerHash, resultHash, published };
    console.log(
      `${dt.toLocaleString()} District: ${districtId}/${min_age} Sessions: ${availableCenters.reduce(
        (a, { sessions }) => a + sessions.length,
        0
      )} Published: ${published.toLocaleString() || null}`
    );
  }
}

function getSlots(centers: Center[], _min_age: 18 | 45) {
  return centers
    .map(({ sessions, ...rest }) => ({
      sessions: sessions.filter(
        ({ available_capacity, min_age_limit }) =>
          available_capacity > 0 && min_age_limit === _min_age
      ),
      ...rest,
    }))
    .filter(({ sessions }) => sessions.length > 0);
}

function makeMessage(centers: Center[]) {
  return `
<b>${centers[0].district_name} ${
    centers[0].sessions[0].min_age_limit
  }+ Available Slots</b>
${centers
  .map(
    ({ name, sessions }) => `
<i>${name}</i>
  ${sessions
    .map(
      ({ date, available_capacity_dose1, available_capacity_dose2 }) =>
        `${date} (${available_capacity_dose1}|${available_capacity_dose2})`
    )
    .join('\n  ')}
`
  )
  .join('')}
Book at https://selfregistration.cowin.gov.in
`;
}

async function postMessage(text: string, chat_id: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const e = await res.text();
    throw new Error(e);
  }
}

function hashCenters(centers: Center[]) {
  return objectHash(new Set(centers.map(({ center_id }) => center_id)));
}

main();
