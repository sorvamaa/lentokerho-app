// Creates a test student in Hämeenkyrön Lentokerho with all graduation
// requirements pre-filled, so the certificate flow can be tested end-to-end.
//
// Käyttö (PowerShell):
//   $env:DATABASE_URL = "postgresql://..."
//   node scripts/seed-test-student.js

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
    await client.query('BEGIN');

    // Locate Hämeenkyrön Lentokerho
    const clubRes = await client.query("SELECT id FROM clubs WHERE slug = 'hameenkyro'");
    if (!clubRes.rows[0]) throw new Error('Hämeenkyrön Lentokerho not found.');
    const clubId = clubRes.rows[0].id;

    // Locate an instructor in the club to use as added_by/completed_by
    const instrRes = await client.query(
      "SELECT id FROM users WHERE club_id = $1 AND role = 'instructor' AND username = 'Marko' LIMIT 1",
      [clubId]
    );
    const instructorId = instrRes.rows[0]
      ? instrRes.rows[0].id
      : (await client.query("SELECT id FROM users WHERE club_id = $1 AND role = 'instructor' LIMIT 1", [clubId])).rows[0].id;

    // Locate Teisko site
    const siteRes = await client.query("SELECT id FROM sites WHERE club_id = $1 AND name = 'Teisko'", [clubId]);
    if (!siteRes.rows[0]) throw new Error("Site 'Teisko' not found in Hämeenkyrön Lentokerho.");
    const siteId = siteRes.rows[0].id;

    // Refuse to re-seed if test student already exists
    const existing = await client.query("SELECT id FROM users WHERE username = 'testi'");
    if (existing.rows[0]) {
      console.log("Käyttäjä 'testi' on jo olemassa (id=" + existing.rows[0].id + "). Skripti ei kosketa kantaa.");
      await client.query('ROLLBACK');
      return;
    }

    // Create the student
    const password = generatePassword(8);
    const passwordHash = bcrypt.hashSync(password, 12);
    const studentRes = await client.query(
      `INSERT INTO users (username, password_hash, role, name, email, phone, status, course_started,
                          pp2_exam_passed, pp2_exam_date, club_id, must_change_password)
       VALUES ($1, $2, 'student', $3, $4, $5, 'ongoing', $6, 1, $7, $8, 1) RETURNING id`,
      [
        'testi', passwordHash, 'Testi Pilotti', 'testi@hameenkyro.local',
        '040-0000000', '2026-01-15', '2026-05-01', clubId
      ]
    );
    const studentId = studentRes.rows[0].id;
    console.log("Luotu testioppilas 'testi' (Testi Pilotti) id=" + studentId);

    // Insert flights: 5 low + 40 high
    await client.query(
      `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
       VALUES ($1, $2, $3, 'low', $4, 'Auringonpaiste, tuuli 3 m/s', 'Maakäsittelyä, perusjarrutus', 'Testidata', 0, $5, 1, $5, CURRENT_TIMESTAMP)`,
      [studentId, '2026-02-15', 5, siteId, instructorId]
    );
    await client.query(
      `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
       VALUES ($1, $2, $3, 'high', $4, 'Pilvinen, tuuli 4 m/s', 'Suunnatut käännökset', 'Testidata', 0, $5, 1, $5, CURRENT_TIMESTAMP)`,
      [studentId, '2026-04-15', 39, siteId, instructorId]
    );
    await client.query(
      `INSERT INTO flights (student_id, date, flight_count, flight_type, site_id, weather, exercises, notes, is_approval_flight, added_by, approved, approved_by, approved_at)
       VALUES ($1, $2, $3, 'high', $4, 'Heikkoa termiikkiä', 'Tarkistuslento', 'Tarkistuslento ok', 1, $5, 1, $5, CURRENT_TIMESTAMP)`,
      [studentId, '2026-05-01', 1, siteId, instructorId]
    );
    console.log('Lisätty lennot: 5 matalaa + 40 korkeaa (joista 1 tarkistuslento)');

    // Insert ALL theory completions
    const topicsRes = await client.query('SELECT key FROM theory_topics_def');
    let inserted = 0;
    for (const row of topicsRes.rows) {
      await client.query(
        'INSERT INTO theory_completions (student_id, topic_key, completed_by, completed_at) VALUES ($1, $2, $3, $4)',
        [studentId, row.key, instructorId, '2026-03-01T12:00:00Z']
      );
      inserted++;
    }
    console.log('Lisätty teoria-suoritukset: ' + inserted + ' aihetta');

    await client.query('COMMIT');

    console.log('\n=== TESTIOPPILAS VALMIS ===');
    console.log('Käyttäjänimi: testi');
    console.log('Kertakäyttösalasana: ' + password);
    console.log('Sähköposti: testi@hameenkyro.local');
    console.log('\nAvaa Hämeenkyrön oppilaslista admin- tai ohjaaja-tunnuksilla — Testi Pilotti pitäisi näkyä, ja banner pitäisi olla vihreä "Valmis valmistumaan".');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('FAIL, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
