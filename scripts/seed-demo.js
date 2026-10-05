// Demo-seed for NODE_ENV=demo instances. Idempotent — safe to call every startup.
// Creates the "Extreme Team" club with Eemeli Aittokallio as chief + 5 sample
// students in various training stages so Eemeli can see the UI populated on login.
//
// Can also be run standalone:
//   DATABASE_URL='postgresql://...' node scripts/seed-demo.js
//
// Does NOT touch other clubs — only creates/skips Extreme Team.

const bcrypt = require('bcryptjs');

const CLUB_SLUG = 'extreme';
const CLUB_NAME = 'Extreme Team';
const CLUB_DESC = 'Varjoliitokerho — demo-ympäristö';
const CHIEF = {
  username: 'eemeli',
  password: 'Eemeli123!!',
  name: 'Eemeli Aittokallio',
  email: 'eemeli@extreme.test',
};
const SITE_NAME = 'Virttaa';

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

async function seedDemo(client) {
  // Skip if already seeded
  const existing = await client.query("SELECT id FROM clubs WHERE slug = $1", [CLUB_SLUG]);
  if (existing.rowCount > 0) {
    console.log(`[demo-seed] ${CLUB_NAME} already exists (club_id=${existing.rows[0].id}) — skipping`);
    return existing.rows[0].id;
  }

  console.log(`[demo-seed] Creating ${CLUB_NAME} with chief ${CHIEF.name}...`);

  // Club
  const clubRes = await client.query(
    'INSERT INTO clubs (name, slug, description) VALUES ($1, $2, $3) RETURNING id',
    [CLUB_NAME, CLUB_SLUG, CLUB_DESC]
  );
  const clubId = clubRes.rows[0].id;

  // Chief instructor — must_change_password=0 so Eemeli logs straight in
  const chiefHash = bcrypt.hashSync(CHIEF.password, 12);
  const chiefRes = await client.query(
    `INSERT INTO users (username, email, name, password_hash, role, club_id, is_chief, must_change_password)
     VALUES ($1, $2, $3, $4, 'instructor', $5, 1, 0) RETURNING id`,
    [CHIEF.username, CHIEF.email, CHIEF.name, chiefHash, clubId]
  );
  const chiefId = chiefRes.rows[0].id;

  // Site
  const siteRes = await client.query(
    'INSERT INTO sites (name, description, club_id) VALUES ($1, $2, $3) RETURNING id',
    [SITE_NAME, 'Demo-lentopaikka', clubId]
  );
  const siteId = siteRes.rows[0].id;

  // Theory topic keys (whatever is in theory_topics_def)
  const topics = await client.query(
    "SELECT key, section_id, (SELECT level FROM theory_sections WHERE id = section_id) as level FROM theory_topics_def"
  );
  const pp1Keys = topics.rows.filter(t => t.level === 'pp1').map(t => t.key);
  const pp2Keys = topics.rows.filter(t => t.level === 'pp2').map(t => t.key);
  const movaKeys = topics.rows.filter(t => t.level === 'mova').map(t => t.key);

  // ============================================================================
  // SAMPLE STUDENTS
  // ============================================================================

  const studentPass = bcrypt.hashSync('Demo123!!', 12);

  async function createStudent(opts) {
    const r = await client.query(
      `INSERT INTO users
         (username, email, name, password_hash, phone, role, status, pp2_exam_passed, pp2_exam_date,
          pp4_exam_passed, pp4_exam_date, mova_status, mova_started_at, mova_exam_passed, mova_exam_date,
          mova_graduated_at, is_mova_only, course_started, student_notes, club_id, must_change_password,
          graduated_at)
       VALUES ($1,$2,$3,$4,$5,'student',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,$20)
       RETURNING id`,
      [
        opts.username, opts.email, opts.name, studentPass, opts.phone || null,
        opts.status, opts.pp2_exam_passed || 0, opts.pp2_exam_date || null,
        opts.pp4_exam_passed || 0, opts.pp4_exam_date || null,
        opts.mova_status || null, opts.mova_started_at || null,
        opts.mova_exam_passed || 0, opts.mova_exam_date || null,
        opts.mova_graduated_at || null, opts.is_mova_only ? 1 : 0,
        opts.course_started, opts.student_notes || '', clubId,
        opts.graduated_at || null
      ]
    );
    return r.rows[0].id;
  }

  async function addFlight(studentId, date, type, options = {}) {
    await client.query(
      `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [studentId, date, options.count || 1, type, siteId, options.weather || null, options.exercises || null, options.notes || null, options.is_approval ? 1 : 0, chiefId]
    );
  }

  async function markTheories(studentId, keys) {
    for (const key of keys) {
      await client.query(
        'INSERT INTO theory_completions (student_id, topic_key, completed_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [studentId, key, chiefId]
      );
    }
  }

  // --- 1. Antti Alku — vasta-aloittanut ---------------------------------------
  const antti = await createStudent({
    username: 'antti.alku',
    email: 'antti@extreme.test',
    name: 'Antti Alku',
    status: 'ongoing',
    course_started: daysAgo(60),
    student_notes: 'Innokas aloittelija, kurssi käynnistynyt syyskuussa.'
  });
  await addFlight(antti, daysAgo(50), 'low');
  await addFlight(antti, daysAgo(45), 'low');
  await addFlight(antti, daysAgo(30), 'low');
  await markTheories(antti, pp1Keys.slice(0, 3));

  // --- 2. Satu Siirtolainen — PP2 valmis valmistumaan -------------------------
  const satu = await createStudent({
    username: 'satu.siirtolainen',
    email: 'satu@extreme.test',
    name: 'Satu Siirtolainen',
    status: 'ongoing',
    course_started: daysAgo(365),
    pp2_exam_passed: 1,
    pp2_exam_date: daysAgo(30),
    student_notes: 'Edistynyt hyvin, PP2 valmistumisvaiheessa.'
  });
  // 5 matalaa + 40 korkeaa yli 7 päivän
  for (let i = 0; i < 5; i++) await addFlight(satu, daysAgo(300 - i * 5), 'low');
  // 7 distinct high-days
  const highDays = [240, 220, 180, 150, 100, 60, 20];
  let highCount = 0;
  for (const d of highDays) {
    const perDay = highCount < 35 ? 6 : 5;
    for (let i = 0; i < perDay; i++) {
      await addFlight(satu, daysAgo(d), 'high', { is_approval: (i === 0 && d === 20) });
    }
    highCount += perDay;
  }
  await markTheories(satu, [...pp1Keys, ...pp2Keys]);

  // --- 3. Jarkko Pilotti — Vain MOVA (jo lisensioitu pilotti) -----------------
  const jarkko = await createStudent({
    username: 'jarkko.pilotti',
    email: 'jarkko@extreme.test',
    name: 'Jarkko Pilotti',
    status: 'completed',
    course_started: daysAgo(30),
    is_mova_only: true,
    mova_status: 'ongoing',
    mova_started_at: daysAgo(30),
    student_notes: 'Siirtyi muusta kerhosta MOVA-koulutukseen.'
  });
  for (let i = 0; i < 3; i++) await addFlight(jarkko, daysAgo(25 - i * 7), 'motor');
  await markTheories(jarkko, movaKeys.slice(0, 10));

  // --- 4. Pirjo Pilvi — PP2 valmis, MOVA kesken -------------------------------
  const pirjo = await createStudent({
    username: 'pirjo.pilvi',
    email: 'pirjo@extreme.test',
    name: 'Pirjo Pilvi',
    status: 'completed',
    course_started: daysAgo(500),
    pp2_exam_passed: 1,
    pp2_exam_date: daysAgo(90),
    graduated_at: daysAgo(85),
    mova_status: 'ongoing',
    mova_started_at: daysAgo(60),
    pp4_exam_passed: 1,
    pp4_exam_date: daysAgo(30),
    student_notes: 'PP2 suoritettu, MOVA-koulutus käynnissä.'
  });
  // Satisfy PP2 record retrospectively (not strictly required for display, keeps profile tidy)
  for (let i = 0; i < 5; i++) await addFlight(pirjo, daysAgo(450 - i * 10), 'low');
  for (const d of [400, 380, 350, 320, 280, 240, 200]) {
    for (let i = 0; i < 6; i++) await addFlight(pirjo, daysAgo(d), 'high', { is_approval: (i === 0 && d === 200) });
  }
  // Motor flights for ongoing MOVA
  for (let i = 0; i < 5; i++) await addFlight(pirjo, daysAgo(50 - i * 8), 'motor');
  await markTheories(pirjo, [...pp1Keys, ...pp2Keys, ...movaKeys.slice(0, 15)]);

  // --- 5. Risto Rohkea — Täysin valmistunut PP2 (ei MOVA) ---------------------
  const risto = await createStudent({
    username: 'risto.rohkea',
    email: 'risto@extreme.test',
    name: 'Risto Rohkea',
    status: 'completed',
    course_started: daysAgo(400),
    pp2_exam_passed: 1,
    pp2_exam_date: daysAgo(60),
    graduated_at: daysAgo(55),
    student_notes: 'Valmistunut keväällä.'
  });
  for (let i = 0; i < 5; i++) await addFlight(risto, daysAgo(350 - i * 15), 'low');
  for (const d of [300, 270, 240, 210, 180, 150, 100]) {
    for (let i = 0; i < 6; i++) await addFlight(risto, daysAgo(d), 'high', { is_approval: (i === 0 && d === 100) });
  }
  await markTheories(risto, [...pp1Keys, ...pp2Keys]);

  // ============================================================================
  // SAMPLE LESSONS
  // ============================================================================

  // Pidetty oppitunti — pari viikkoa sitten
  if (pp2Keys.length >= 2) {
    const l1 = await client.query(
      "INSERT INTO lessons (date, instructor_id, notes, status) VALUES ($1, $2, 'Teoriapäivä: sääoppi ja ilmakehä.', 'held') RETURNING id",
      [daysAgo(14), chiefId]
    );
    const l1Id = l1.rows[0].id;
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [l1Id, satu]);
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [l1Id, pirjo]);
    for (const key of pp2Keys.slice(0, 2)) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [l1Id, key]);
    }
  }

  // Suunniteltu oppitunti — ensi viikolla
  if (pp1Keys.length >= 2) {
    const next = new Date();
    next.setDate(next.getDate() + 5);
    const nextDate = next.toISOString().split('T')[0];
    const l2 = await client.query(
      "INSERT INTO lessons (date, instructor_id, notes, status) VALUES ($1, $2, 'PP1-starttipäivä: tutustuminen, varusteet, maaharjoittelu.', 'planned') RETURNING id",
      [nextDate, chiefId]
    );
    const l2Id = l2.rows[0].id;
    await client.query('INSERT INTO lesson_students (lesson_id, student_id) VALUES ($1, $2)', [l2Id, antti]);
    for (const key of pp1Keys.slice(0, 3)) {
      await client.query('INSERT INTO lesson_topics (lesson_id, topic_key) VALUES ($1, $2)', [l2Id, key]);
    }
  }

  console.log(`[demo-seed] Done: 1 club, 1 instructor, 5 students, 2 lessons, flights + theory`);
  return clubId;
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
