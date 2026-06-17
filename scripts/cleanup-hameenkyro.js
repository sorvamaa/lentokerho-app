// Poistaa Hämeenkyrön Lentokerhon test-oppilaat ja heidän datansa transaktion sisällä.
// Säilyttää: kerhon, ohjaajat, sitet, kerhon asetukset.
//
// Käyttö (PowerShell):
//   $env:DATABASE_URL = "postgresql://..."
//   node scripts/cleanup-hameenkyro.js --confirm
//
// HUOMIO: Tee tuore manuaalinen backup Railwayn UI:sta ennen ajoa.

const { Pool } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not set.');
    process.exit(1);
  }
  if (process.argv[2] !== '--confirm') {
    console.error('Tämä skripti POISTAA pysyvästi kaikki Hämeenkyrön Lentokerhon oppilaskäyttäjät ja heidän datansa.');
    console.error('Aja uudestaan --confirm-flagilla jos olet varma:');
    console.error('  node scripts/cleanup-hameenkyro.js --confirm');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const club = await client.query("SELECT id, name FROM clubs WHERE slug = 'hameenkyro'");
    if (!club.rows[0]) throw new Error("Hämeenkyrön Lentokerho ei löytynyt (slug='hameenkyro').");
    const clubId = club.rows[0].id;
    console.log('Hämeenkyrön Lentokerho id=' + clubId);

    const students = await client.query(
      "SELECT id, username, name FROM users WHERE club_id = $1 AND role = 'student'",
      [clubId]
    );

    if (students.rowCount === 0) {
      console.log('Ei oppilaskäyttäjiä. Ei mitään poistettavaa. ROLLBACK.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('\nPoistettavat oppilaat (' + students.rowCount + '):');
    for (const s of students.rows) {
      console.log('  - ' + s.username + ' (' + s.name + ', id=' + s.id + ')');
    }

    const studentIds = students.rows.map(s => s.id);

    // audit_log: poistetaan oppilaiden omat toimet (säilytetään ohjaajien toimet vaikka ne viittaisivat poistettuihin oppilaisiin)
    const auditDel = await client.query(
      "DELETE FROM audit_log WHERE user_id = ANY($1)",
      [studentIds]
    );

    // Käyttäjien poisto — CASCADE hoitaa flights/theory_completions/equipment/attachments/lesson_students
    const userDel = await client.query("DELETE FROM users WHERE id = ANY($1)", [studentIds]);

    // Orvot lessons: instructor on Hämeenkyrön ohjaaja JA yhtään lesson_students-riviä ei jäänyt jäljelle
    const instructors = await client.query(
      "SELECT id FROM users WHERE club_id = $1 AND role = 'instructor'",
      [clubId]
    );
    const instructorIds = instructors.rows.map(r => r.id);
    let lessonDel = { rowCount: 0 };
    if (instructorIds.length > 0) {
      lessonDel = await client.query(
        "DELETE FROM lessons WHERE instructor_id = ANY($1) AND id NOT IN (SELECT lesson_id FROM lesson_students)",
        [instructorIds]
      );
    }

    console.log('\nPoistettu:');
    console.log('  audit_log (oppilaiden omat toimet): ' + auditDel.rowCount);
    console.log('  users (oppilaat):                   ' + userDel.rowCount);
    console.log('    + cascade: flights, theory_completions, equipment, attachments, lesson_students');
    console.log('  lessons (orvot):                    ' + lessonDel.rowCount);

    await client.query('COMMIT');
    console.log('\n✓ Cleanup valmis. Aja inspect-skripti uudelleen varmistaaksesi lopputilan.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n✗ Cleanup epäonnistui, kanta palautettu (ROLLBACK):');
    console.error('  ' + e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
