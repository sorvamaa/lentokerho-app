// Demo-seed for NODE_ENV=demo instances. Idempotent — safe to call every startup.
// Creates a set of demo clubs with chief instructors + 5 sample students each,
// in various training stages so each chief sees their UI populated on login.
//
// Can also be run standalone:
//   DATABASE_URL='postgresql://...' node scripts/seed-demo.js
//
// Does NOT touch clubs that already exist — only creates missing demo clubs.

const bcrypt = require('bcryptjs');

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

// A reusable set of 5 student archetypes that showcase every state in the UI.
// Each archetype takes a `names` object with a first/last name set per club so
// each demo looks like it has distinct people, not clones.
function makeStudents(nameSet) {
  return [
    {
      archetype: 'beginner',
      ...nameSet[0],
      status: 'ongoing',
      course_started: daysAgo(60),
      student_notes: 'Vasta-aloittanut, 3 matalaa lentoa tehty.',
      flights: [
        { date: daysAgo(50), type: 'low' },
        { date: daysAgo(45), type: 'low' },
        { date: daysAgo(30), type: 'low' },
      ],
      theory: { pp1: 3 },
    },
    {
      archetype: 'ready_to_graduate',
      ...nameSet[1],
      status: 'ongoing',
      course_started: daysAgo(365),
      pp2_exam_passed: 1,
      pp2_exam_date: daysAgo(30),
      student_notes: 'Edistynyt hyvin, PP2 valmistumisvaiheessa.',
      flights: 'ready_to_graduate',
      theory: { pp1: 'all', pp2: 'all' },
    },
    {
      archetype: 'mova_only',
      ...nameSet[2],
      status: 'completed',
      course_started: daysAgo(30),
      is_mova_only: true,
      mova_status: 'ongoing',
      mova_started_at: daysAgo(30),
      student_notes: 'Siirtyi muusta kerhosta MOVA-koulutukseen.',
      flights: [
        { date: daysAgo(25), type: 'motor' },
        { date: daysAgo(18), type: 'motor' },
        { date: daysAgo(11), type: 'motor' },
      ],
      theory: { mova: 10 },
    },
    {
      archetype: 'pp2_done_mova_in_progress',
      ...nameSet[3],
      status: 'completed',
      course_started: daysAgo(500),
      pp2_exam_passed: 1,
      pp2_exam_date: daysAgo(90),
      graduated_at: daysAgo(85),
      mova_status: 'ongoing',
      mova_started_at: daysAgo(60),
      pp4_exam_passed: 1,
      pp4_exam_date: daysAgo(30),
      student_notes: 'PP2 suoritettu, MOVA-koulutus käynnissä.',
      flights: 'pp2_done_plus_mova',
      theory: { pp1: 'all', pp2: 'all', mova: 15 },
    },
    {
      archetype: 'graduated',
      ...nameSet[4],
      status: 'completed',
      course_started: daysAgo(400),
      pp2_exam_passed: 1,
      pp2_exam_date: daysAgo(60),
      graduated_at: daysAgo(55),
      student_notes: 'Valmistunut keväällä.',
      flights: 'graduated',
      theory: { pp1: 'all', pp2: 'all' },
    },
  ];
}

// Demo-clubs. Add new ones here; the seed is idempotent — existing clubs are skipped.
const DEMO_CLUBS = [
  {
    slug: 'extreme',
    name: 'Extreme Team',
    description: 'Varjoliitokerho — demo-ympäristö',
    chief: {
      username: 'eemeli',
      password: 'Eemeli123!!',
      name: 'Eemeli Aittokallio',
      email: 'eemeli@extreme.test',
    },
    siteName: 'Virttaa',
    studentNames: [
      { username: 'antti.alku', email: 'antti@extreme.test', name: 'Antti Alku' },
      { username: 'satu.siirtolainen', email: 'satu@extreme.test', name: 'Satu Siirtolainen' },
      { username: 'jarkko.pilotti', email: 'jarkko@extreme.test', name: 'Jarkko Pilotti' },
      { username: 'pirjo.pilvi', email: 'pirjo@extreme.test', name: 'Pirjo Pilvi' },
      { username: 'risto.rohkea', email: 'risto@extreme.test', name: 'Risto Rohkea' },
    ],
  },
  {
    slug: 'itaporvoo',
    name: 'Itä-Porvoon Varjoliitäjät ry',
    description: 'Varjoliitokerho — demo-ympäristö',
    chief: {
      username: 'markku',
      password: 'Markku123!!',
      name: 'Markku Mastomäki',
      email: 'markku@itaporvoo.test',
    },
    siteName: 'Söderskog',
    studentNames: [
      { username: 'vilma.virtanen', email: 'vilma@itaporvoo.test', name: 'Vilma Virtanen' },
      { username: 'teemu.taivas', email: 'teemu@itaporvoo.test', name: 'Teemu Taivas' },
      { username: 'hannu.harrastaja', email: 'hannu@itaporvoo.test', name: 'Hannu Harrastaja' },
      { username: 'kaisa.korkealla', email: 'kaisa@itaporvoo.test', name: 'Kaisa Korkealla' },
      { username: 'oskari.olympia', email: 'oskari@itaporvoo.test', name: 'Oskari Olympia' },
    ],
  },
];

async function seedClub(client, def, topicsByLevel) {
  const existing = await client.query('SELECT id FROM clubs WHERE slug = $1', [def.slug]);
  if (existing.rowCount > 0) {
    console.log(`[demo-seed] ${def.name} already exists (club_id=${existing.rows[0].id}) — skipping`);
    return existing.rows[0].id;
  }

  console.log(`[demo-seed] Creating ${def.name} with chief ${def.chief.name}...`);

  const clubRes = await client.query(
    'INSERT INTO clubs (name, slug, description) VALUES ($1, $2, $3) RETURNING id',
    [def.name, def.slug, def.description]
  );
  const clubId = clubRes.rows[0].id;

  // Chief — must_change_password=0 so the chief logs straight in on the demo
  const chiefHash = bcrypt.hashSync(def.chief.password, 12);
  const chiefRes = await client.query(
    `INSERT INTO users (username, email, name, password_hash, role, club_id, is_chief, must_change_password)
     VALUES ($1, $2, $3, $4, 'instructor', $5, 1, 0) RETURNING id`,
    [def.chief.username, def.chief.email, def.chief.name, chiefHash, clubId]
  );
  const chiefId = chiefRes.rows[0].id;

  const siteRes = await client.query(
    'INSERT INTO sites (name, description, club_id) VALUES ($1, $2, $3) RETURNING id',
    [def.siteName, 'Demo-lentopaikka', clubId]
  );
  const siteId = siteRes.rows[0].id;

  const studentPass = bcrypt.hashSync('Demo123!!', 12);
  const students = makeStudents(def.studentNames);
  const studentIds = {};

  for (const s of students) {
    const r = await client.query(
      `INSERT INTO users
         (username, email, name, password_hash, role, status, pp2_exam_passed, pp2_exam_date,
          pp4_exam_passed, pp4_exam_date, mova_status, mova_started_at, mova_exam_passed,
          mova_graduated_at, is_mova_only, course_started, student_notes, club_id,
          must_change_password, graduated_at)
       VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18)
       RETURNING id`,
      [
        s.username, s.email, s.name, studentPass,
        s.status, s.pp2_exam_passed || 0, s.pp2_exam_date || null,
        s.pp4_exam_passed || 0, s.pp4_exam_date || null,
        s.mova_status || null, s.mova_started_at || null, s.mova_exam_passed || 0,
        s.mova_graduated_at || null, s.is_mova_only ? 1 : 0,
        s.course_started, s.student_notes || '', clubId, s.graduated_at || null,
      ]
    );
    studentIds[s.archetype] = r.rows[0].id;
    const sid = r.rows[0].id;

    // Flights — either an explicit list or a canned pattern
    const flightSpec = s.flights;
    const flights = Array.isArray(flightSpec) ? flightSpec : expandFlightPattern(flightSpec);
    for (const f of flights) {
      await client.query(
        `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, is_approval_flight, added_by)
         VALUES ($1, $2, 1, $3, $4, $5, $6)`,
        [sid, f.date, f.type, siteId, f.is_approval ? 1 : 0, chiefId]
      );
    }

    // Theory — count or 'all'
    const theoryKeys = [];
    for (const level of ['pp1', 'pp2', 'mova']) {
      const spec = s.theory[level];
      if (spec === undefined) continue;
      const keys = topicsByLevel[level] || [];
      const take = spec === 'all' ? keys.length : spec;
      theoryKeys.push(...keys.slice(0, take));
    }
    for (const key of theoryKeys) {
      await client.query(
        'INSERT INTO theory_completions (student_id, topic_key, completed_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [sid, key, chiefId]
      );
    }
  }

  // Lessons — one held two weeks ago, one planned for next week
  const pp1Keys = topicsByLevel.pp1 || [];
  const pp2Keys = topicsByLevel.pp2 || [];
  if (pp2Keys.length >= 2) {
    const l = await client.query(
      "INSERT INTO lessons (date, instructor_id, notes, status) VALUES ($1, $2, 'Teoriapäivä: sääoppi ja ilmakehä.', 'held') RETURNING id",
      [daysAgo(14), chiefId]
    );
    const lid = l.rows[0].id;
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [lid, studentIds.ready_to_graduate]);
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [lid, studentIds.pp2_done_mova_in_progress]);
    for (const key of pp2Keys.slice(0, 2)) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [lid, key]);
    }
  }
  if (pp1Keys.length >= 3) {
    const next = new Date();
    next.setDate(next.getDate() + 5);
    const nextDate = next.toISOString().split('T')[0];
    const l = await client.query(
      "INSERT INTO lessons (date, instructor_id, notes, status) VALUES ($1, $2, 'PP1-starttipäivä: tutustuminen, varusteet, maaharjoittelu.', 'planned') RETURNING id",
      [nextDate, chiefId]
    );
    const lid = l.rows[0].id;
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [lid, studentIds.beginner]);
    for (const key of pp1Keys.slice(0, 3)) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [lid, key]);
    }
  }

  console.log(`[demo-seed] ${def.name}: 1 instructor, 5 students, 2 lessons, flights + theory`);
  return clubId;
}

// Canned flight patterns reused across archetypes. Keeps the student spec small.
function expandFlightPattern(key) {
  if (key === 'ready_to_graduate') {
    const out = [];
    for (let i = 0; i < 5; i++) out.push({ date: daysAgo(300 - i * 5), type: 'low' });
    const highDays = [240, 220, 180, 150, 100, 60, 20];
    let count = 0;
    for (const d of highDays) {
      const perDay = count < 35 ? 6 : 5;
      for (let i = 0; i < perDay; i++) {
        out.push({ date: daysAgo(d), type: 'high', is_approval: (i === 0 && d === 20) });
      }
      count += perDay;
    }
    return out;
  }
  if (key === 'pp2_done_plus_mova') {
    const out = [];
    for (let i = 0; i < 5; i++) out.push({ date: daysAgo(450 - i * 10), type: 'low' });
    for (const d of [400, 380, 350, 320, 280, 240, 200]) {
      for (let i = 0; i < 6; i++) {
        out.push({ date: daysAgo(d), type: 'high', is_approval: (i === 0 && d === 200) });
      }
    }
    for (let i = 0; i < 5; i++) out.push({ date: daysAgo(50 - i * 8), type: 'motor' });
    return out;
  }
  if (key === 'graduated') {
    const out = [];
    for (let i = 0; i < 5; i++) out.push({ date: daysAgo(350 - i * 15), type: 'low' });
    for (const d of [300, 270, 240, 210, 180, 150, 100]) {
      for (let i = 0; i < 6; i++) {
        out.push({ date: daysAgo(d), type: 'high', is_approval: (i === 0 && d === 100) });
      }
    }
    return out;
  }
  return [];
}

async function seedDemo(client) {
  // Load topic keys once; shared across all clubs.
  const topics = await client.query(
    "SELECT key, (SELECT level FROM theory_sections WHERE id = section_id) as level FROM theory_topics_def"
  );
  const topicsByLevel = {
    pp1: topics.rows.filter(t => t.level === 'pp1').map(t => t.key),
    pp2: topics.rows.filter(t => t.level === 'pp2').map(t => t.key),
    mova: topics.rows.filter(t => t.level === 'mova').map(t => t.key),
  };

  for (const def of DEMO_CLUBS) {
    await seedClub(client, def, topicsByLevel);
  }
}

// Standalone runner
if (require.main === module) {
  const { Pool } = require('pg');
  (async () => {
    if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await seedDemo(client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[demo-seed] FAILED:', e.message);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }
  })();
}

module.exports = { seedDemo };
