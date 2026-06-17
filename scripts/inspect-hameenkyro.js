// Read-only: listaa Hämeenkyrön Lentokerhon sisällön tuotantokannassa.
// Käyttö (PowerShell):
//   $env:DATABASE_URL = "postgresql://..."
//   node scripts/inspect-hameenkyro.js

const { Pool } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const club = await pool.query("SELECT id, name FROM clubs WHERE slug = 'hameenkyro'");
    if (!club.rows[0]) {
      console.error("Hämeenkyrön Lentokerho ei löytynyt (slug='hameenkyro').");
      process.exit(1);
    }
    const clubId = club.rows[0].id;
    console.log('=== Hämeenkyrön Lentokerho (id=' + clubId + ') ===\n');

    const users = await pool.query(
      "SELECT id, username, role, name, email, must_change_password FROM users WHERE club_id = $1 ORDER BY role, username",
      [clubId]
    );
    console.log('Käyttäjät (' + users.rowCount + '):');
    for (const u of users.rows) {
      const mark = u.must_change_password ? ' [must_change_password=1]' : '';
      console.log('  ' + u.role.padEnd(10) + ' ' + u.username.padEnd(12) + ' ' + (u.name || '').padEnd(28) + ' ' + (u.email || '') + mark);
    }
    console.log();

    const sites = await pool.query("SELECT id, name FROM sites WHERE club_id = $1 ORDER BY name", [clubId]);
    console.log('Sitet (' + sites.rowCount + '):');
    for (const s of sites.rows) console.log('  ' + s.name);
    console.log();

    const studentIds = users.rows.filter(u => u.role === 'student').map(u => u.id);
    const instructorIds = users.rows.filter(u => u.role === 'instructor').map(u => u.id);

    if (studentIds.length > 0) {
      const flights = await pool.query("SELECT COUNT(*) AS c FROM flights WHERE student_id = ANY($1)", [studentIds]);
      const theory = await pool.query("SELECT COUNT(*) AS c FROM theory_completions WHERE student_id = ANY($1)", [studentIds]);
      const equip = await pool.query("SELECT COUNT(*) AS c FROM equipment WHERE student_id = ANY($1)", [studentIds]);
      const att = await pool.query("SELECT COUNT(*) AS c FROM attachments WHERE student_id = ANY($1)", [studentIds]);
      const lstud = await pool.query("SELECT COUNT(*) AS c FROM lesson_students WHERE student_id = ANY($1)", [studentIds]);
      const auditByStudents = await pool.query("SELECT COUNT(*) AS c FROM audit_log WHERE user_id = ANY($1)", [studentIds]);
      console.log('Oppilaiden data (poistettaisiin cleanupissa):');
      console.log('  flights:             ' + flights.rows[0].c);
      console.log('  theory_completions:  ' + theory.rows[0].c);
      console.log('  equipment:           ' + equip.rows[0].c);
      console.log('  attachments:         ' + att.rows[0].c);
      console.log('  lesson_students:     ' + lstud.rows[0].c);
      console.log('  audit_log (oppilaiden omat toimet): ' + auditByStudents.rows[0].c);
      console.log();
    } else {
      console.log('Ei oppilaita kerhossa. Cleanupille ei ole tarvetta.\n');
    }

    if (instructorIds.length > 0) {
      const lessons = await pool.query("SELECT COUNT(*) AS c FROM lessons WHERE instructor_id = ANY($1)", [instructorIds]);
      const orphanLessons = await pool.query(
        "SELECT COUNT(*) AS c FROM lessons l WHERE l.instructor_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM lesson_students ls WHERE ls.lesson_id = l.id AND ls.student_id <> ALL($2))",
        [instructorIds, studentIds.length > 0 ? studentIds : [0]]
      );
      console.log('Ohjaajien data:');
      console.log('  lessons yhteensä:    ' + lessons.rows[0].c);
      console.log('  jäisi orvoiksi cleanup-jälkeen (vain Hämeenkyrön oppilaita): ' + orphanLessons.rows[0].c);
      console.log();
    }

    console.log('Yhteenveto: cleanup säilyttäisi:');
    const keepUsers = users.rows.filter(u => u.role !== 'student');
    for (const u of keepUsers) console.log('  - ' + u.username + ' (' + u.role + ')');
    console.log('  - sitet (' + sites.rowCount + ' kpl, oletetut paikat säilyvät)');
  } finally {
    await pool.end();
  }
})();
