// One-shot: nollaa tunnettujen seed-tilien salasanat 8-merkkisiksi
// kertakäyttösalasanoiksi ja pakottaa salasananvaihdon ensimmäisellä loginilla.
//
// Käyttö (lokaalisti, tuotannon DB:tä vasten Railwayn julkisen proxyn yli):
//   1. Avaa Railway → Postgres → Variables ja kopioi DATABASE_PUBLIC_URL
//   2. Aja (nollaa kaikki seed-käyttäjät):
//        DATABASE_URL='postgresql://...' node scripts/reset-seed-passwords.js
//      Tai vain valitut käyttäjät komentoriviparametreina:
//        DATABASE_URL='postgresql://...' node scripts/reset-seed-passwords.js admin Marko
//   3. Toimita salasanat käyttäjille turvallisesti (Signal/SMS, ei sähköposti)

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const DEFAULT_USERS = ['admin', 'Taavi', 'Marko', 'Väiski', 'Jarno', 'Juho'];
const SEED_USERS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_USERS;

// 55 merkkiä, ei sekoittuvia (0/O/o, 1/l/I)
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
    console.error('Error: DATABASE_URL environment variable is not set.');
    console.error('Set it to the Railway Postgres public proxy URL and rerun.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const results = [];
  try {
    for (const username of SEED_USERS) {
      const pwd = generatePassword(8);
      const hash = bcrypt.hashSync(pwd, 12);
      const { rowCount } = await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = 1 WHERE username = $2',
        [hash, username]
      );
      results.push({
        username,
        status: rowCount === 0 ? 'NOT FOUND' : 'OK',
        password: rowCount === 0 ? '—' : pwd
      });
    }

    console.log('\n=== SEED PASSWORD RESET ===\n');
    console.log('Käyttäjä   | Tila      | Kertakäyttösalasana');
    console.log('-----------+-----------+--------------------');
    for (const r of results) {
      console.log(`${r.username.padEnd(10)} | ${r.status.padEnd(9)} | ${r.password}`);
    }
    console.log('\nKaikki tilit on merkitty must_change_password = 1.');
    console.log('Käyttäjän on vaihdettava salasana ensimmäisellä loginilla.');
    console.log('Toimita salasanat turvallisesti (Signal/SMS, EI sähköposti).\n');
  } catch (e) {
    console.error('Reset failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
