// Creates MOVA-related test students in Hämeenkyrön Lentokerho for testing
// the MOVA feature end-to-end.
//
// Käyttö (PowerShell):
//   $env:DATABASE_URL = "postgresql://..."
//   node scripts/seed-mova-test-students.js
//
// Creates two students:
//   - 'mova_addon'  PP2 graduated, MOVA ongoing and fully ready to graduate
//   - 'mova_yhdist' PP2 and MOVA ready to graduate together (combined cert)

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(length = 8) {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let pwd = '';
  while (pwd.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < limit) pwd += ALPHABET[byte % ALPHABET.length];
  }
  return pwd;
}

const SCENARIOS = [
  {
    username: 'mova_addon',
    fullName: 'Antero Addon',
    email: 'antero.addon@hameenkyro.local',
    note: 'PP2 valmistunut, MOVA käynnissä ja valmis valmistumaan.',
    pp2GraduatedDaysAgo: 90, // PP2 graduated months ago — cert default should be MOVA-only
    movaStartedDaysAgo: 60,
    motorFlightsOnDays: ['2026-04-01', '2026-04-15', '2026-05-01', '2026-05-15', '2026-06-01', '2026-06-08', '2026-06-15'],
    extraPp2Setup: true
  },
  {
    username: 'mova_yhdist',
    fullName: 'Yrjö Yhdistetty',
    email: 'yrjo.yhdistetty@hameenkyro.local',
    note: 'PP2 ja MOVA ready samaan aikaan — yhdistetyn todistuksen oletustila.',
    pp2GraduatedDaysAgo: null, // not yet graduated
    movaStartedDaysAgo: 30,
    motorFlightsOnDays: ['2026-04-10', '2026-04-20', '2026-05-05', '2026-05-20', '2026-06-05', '2026-06-12', '2026-06-15'],
    extraPp2Setup: true
  }
];

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    const clubRes = await client.query("SELECT id FROM clubs WHERE slug = 'hameenkyro'");
    if (!clubRes.rows[0]) throw new Error('Hämeenkyrön Lentokerho not found.');
    const clubId = clubRes.rows[0].id;

    const instrRes = await client.query(
      "SELECT id FROM users WHERE club_id = $1 AND role = 'instructor' AND username = 'Marko' LIMIT 1",
      [clubId]
    );
    const instructorId = instrRes.rows[0]
      ? instrRes.rows[0].id
      : (await client.query("SELECT id FROM users WHERE club_id = $1 AND role = 'instructor' LIMIT 1", [clubId])).rows[0].id;

    const siteRes = await client.query("SELECT id FROM sites WHERE club_id = $1 AND name = 'Teisko'", [clubId]);
    if (!siteRes.rows[0]) throw new Error("Site 'Teisko' not found.");
    const siteId = siteRes.rows[0].id;

    const allMovaTopics = (await client.query("SELECT td.key FROM theory_topics_def td JOIN theory_sections ts ON ts.id = td.section_id WHERE ts.level = 'mova'")).rows;
    const allPp1Pp2Topics = (await client.query("SELECT td.key FROM theory_topics_def td JOIN theory_sections ts ON ts.id = td.section_id WHERE ts.level IN ('pp1','pp2')")).rows;

    const created = [];

    for (const sc of SCENARIOS) {
      await client.query('BEGIN');
      try {
        const existing = await client.query('SELECT id FROM users WHERE username = $1', [sc.username]);
        if (existing.rows[0]) {
          console.log(`[skip] ${sc.username} on jo olemassa (id=${existing.rows[0].id}).`);
          await client.query('ROLLBACK');
          continue;
        }

        const password = generatePassword(8);
        const passwordHash = bcrypt.hashSync(password, 12);
        const pp2Status = sc.pp2GraduatedDaysAgo !== null ? 'completed' : 'ongoing';
        const pp2GraduatedAt = sc.pp2GraduatedDaysAgo !== null
          ? `CURRENT_TIMESTAMP - INTERVAL '${sc.pp2GraduatedDaysAgo} days'`
          : 'NULL';

        const studentRes = await client.query(
          `INSERT INTO users (
             username, password_hash, role, name, email, phone, status, course_started,
             pp2_exam_passed, pp2_exam_date, pp4_exam_passed, pp4_exam_date,
             mova_status, mova_started_at, mova_exam_passed, mova_exam_date,
             club_id, must_change_password, graduated_at
           )
           VALUES (
             $1, $2, 'student', $3, $4, $5, $6, $7,
             1, $8, 1, $9,
             'ongoing', CURRENT_TIMESTAMP - INTERVAL '${sc.movaStartedDaysAgo} days', 1, $10,
             $11, 1, ${pp2GraduatedAt}
           ) RETURNING id`,
          [
            sc.username, passwordHash, sc.fullName, sc.email, '040-0000000', pp2Status, '2025-08-15',
            '2026-02-20', '2026-04-15', '2026-05-01', clubId
          ]
        );
        const studentId = studentRes.rows[0].id;

        // PP2 flight requirements: 5 matalat + 40 korkeat across 7 päivää
        if (sc.extraPp2Setup) {
          await client.query(
            `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
             VALUES ($1, '2025-09-10', 5, 'low', $2, '', 'Matalat', 'Testidata', 0, $3, 1, $3, CURRENT_TIMESTAMP)`,
            [studentId, siteId, instructorId]
          );
          const highDays = ['2025-10-01', '2025-10-15', '2025-11-05', '2025-11-20', '2025-12-10', '2026-01-15', '2026-02-15'];
          for (const day of highDays) {
            await client.query(
              `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
               VALUES ($1, $2, 6, 'high', $3, '', 'Korkeat', 'Testidata', 0, $4, 1, $4, CURRENT_TIMESTAMP)`,
              [studentId, day, siteId, instructorId]
            );
          }
        }

        // All PP1+PP2 theories completed
        for (const t of allPp1Pp2Topics) {
          await client.query(
            'INSERT INTO theory_completions (student_id, topic_key, completed_by, completed_at) VALUES ($1, $2, $3, $4)',
            [studentId, t.key, instructorId, '2026-02-15T12:00:00Z']
          );
        }

        // Motor flights for MOVA requirement (7 flights on 7 distinct days)
        // Last motor flight is marked is_approval_flight=1 — the MOVA tarkkari
        const lastIdx = sc.motorFlightsOnDays.length - 1;
        for (let i = 0; i < sc.motorFlightsOnDays.length; i++) {
          const day = sc.motorFlightsOnDays[i];
          const isApproval = i === lastIdx ? 1 : 0;
          const note = isApproval ? 'MOVA-tarkastuslento' : 'Moottorilento';
          await client.query(
            `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
             VALUES ($1, $2, 1, 'motor', $3, '', $4, 'Testidata', $5, $6, 1, $6, CURRENT_TIMESTAMP)`,
            [studentId, day, siteId, note, isApproval, instructorId]
          );
        }

        // All MOVA theories completed
        for (const t of allMovaTopics) {
          await client.query(
            'INSERT INTO theory_completions (student_id, topic_key, completed_by, completed_at) VALUES ($1, $2, $3, $4)',
            [studentId, t.key, instructorId, '2026-05-20T12:00:00Z']
          );
        }

        await client.query('COMMIT');
        created.push({ username: sc.username, name: sc.fullName, password, note: sc.note });
        console.log(`[ok]   ${sc.username} luotu (id=${studentId})`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`[fail] ${sc.username}: ${e.message}`);
      }
    }

    if (created.length > 0) {
      console.log('\n=== UUDET TESTIOPPILAAT ===');
      for (const u of created) {
        console.log(`  ${u.username.padEnd(14)} (${u.name})  pwd=${u.password}`);
        console.log(`     ${u.note}`);
      }
    } else {
      console.log('\nEi luotu uusia oppilaita.');
    }
  } finally {
    client.release();
    await pool.end();
  }
})();
