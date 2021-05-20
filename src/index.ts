import fetch from 'node-fetch';
import hash from 'object-hash';

if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  dotenv.config();
}
const { CHAT_ID, BOT_TOKEN, DISTRICT_IDS } = process.env;

const lastMessages: Record<number, { hash: string | null; published: Date }> = {};

function main() {
  if (!CHAT_ID || !BOT_TOKEN || !DISTRICT_IDS) {
    console.error('Required environment variables not found');
    process.exit(1);
  }

  console.log(`Starting app:${process.env.APP_VERSION || 'dev'}`);
  DISTRICT_IDS.split(',')
    .map((x) => parseInt(x, 10))
    .forEach((districtId) => {
      lastMessages[districtId] = { hash: null, published: null };
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
  setTimeout(() => run(districtId), 15 * 1000);
}

async function request(districtId: number, dt: Date) {
  const date = `${String(dt.getDate()).padStart(2, '0')}-${String(
    dt.getMonth() + 1
  ).padStart(2, '0')}-${dt.getFullYear()}`;
  const time = `${String(dt.getHours()).padStart(2, '0')}:${String(
    dt.getMinutes()
  ).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;

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

  const availableCenters = getSlots(data.centers);
  console.log(
    `${date} ${time} District: ${districtId} Available: ${availableCenters.length}`
  );
  if (availableCenters.length === 0) {
    lastMessages[districtId] = { ...lastMessages[districtId], hash: null };
    return;
  }

  const msgHash = hashResult(availableCenters);
  const { hash: lastHash, published: lastPublished } = lastMessages[districtId];
  if (
    lastHash !== msgHash ||
    !lastPublished ||
    dt.getTime() - lastPublished.getTime() > 1000 * 60 * 15
  ) {
    const msg = makeMessage(availableCenters);
    await postMessage(msg);
    console.log(
      `${date} ${time} District: ${districtId} Published: ${availableCenters.reduce(
        (a, { sessions }) => a + sessions.length,
        0
      )}`
    );
    lastMessages[districtId] = { hash: msgHash, published: new Date() };
  }
}

function getSlots(centers: Center[]) {
  return centers
    .map(({ sessions, ...rest }) => ({
      sessions: sessions.filter(
        ({ available_capacity, min_age_limit }) =>
          available_capacity > 0 && min_age_limit === 18
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
    .join(', ')}
`
  )
  .join('')}
`;
}

async function postMessage(text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: `@${CHAT_ID}`,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const e = await res.text();
    throw new Error(e);
  }
}

function hashResult(centers: Center[]) {
  return hash(new Set(centers.map(({ center_id }) => center_id)));
}

function djb(block: Buffer) {
  let hash = 0;
  for (var i = 0; i < block.length; i++) {
    hash = (hash * 33 + block[i]) >>> 0;
  }
  return hash;
}

main();
