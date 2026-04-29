// Generates in-app HTML user guides served from public/docs/.
// Run: node scripts/generate-html-guides.js
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'docs');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- Content as structured data, rendered to HTML ----------

// Block types:
//   ['h1', text]
//   ['h2', text]
//   ['p', text]
//   ['ul', [items]]
//   ['img', filename, caption, { maxWidth: 520 }]

const instructor = {
  title: 'PilottiPolku – Käyttöohje ohjaajalle',
  subtitle: 'Varjoliidon koulutussovellus lentokerhoille',
  blocks: [
    ['h1', 'Tervetuloa'],
    ['p', 'PilottiPolku on lentokerhon koulutusjärjestelmä, jossa ohjaaja voi seurata oppilaidensa edistymistä, kirjata lentoja, hallita oppitunteja ja merkitä teoria-aiheita suoritetuiksi. Tämä ohje kertoo, miten pääset alkuun ja mistä löydät tärkeimmät toiminnot.'],
    ['p', 'Sovellus toimii selaimessa osoitteessa https://pilottipolku.fi. Kaikki näkymät ovat suomeksi ja mukautuvat myös puhelimen ruudulle.'],

    ['h1', '1. Kirjautuminen'],
    ['p', 'Avaa selain ja mene sovelluksen osoitteeseen. Kirjautumislomake kysyy käyttäjänimen ja salasanan, jotka saat kerhon pääkäyttäjältä.'],
    ['img', '01-login.png', 'Kuva 1. Kirjautumisnäkymä.'],
    ['p', 'Ensimmäisen kirjautumisen jälkeen tuotantoympäristössä järjestelmä voi vaatia salasanan vaihtoa. Syötä nykyinen salasana ja uusi, vähintään 8 merkkiä pitkä salasana. Jos unohdit salasanasi, käytä "Unohtuiko salasana?" -linkkiä — saat palautuslinkin sähköpostiisi.'],

    ['h1', '2. Päänäkymä (Dashboard)'],
    ['p', 'Kirjautumisen jälkeen näet Dashboardin, joka kokoaa kerhosi tilanteen yhteen näkymään: aktiivisten oppilaiden määrä, viimeisimmät tapahtumat ja pikalinkit usein käytettyihin toimintoihin.'],
    ['img', 'instructor-01-dashboard.png', 'Kuva 2. Ohjaajan Dashboard.'],

    ['h1', '3. Oppilaat'],
    ['p', 'Vasemman sivuvalikon "Oppilaat"-linkistä aukeaa kerhosi oppilaiden listanäkymä. Jokaisesta oppilaasta näet statuksen, teorian PP1- ja PP2-edistymispalkit, matalien ja korkeiden lentojen määrän sekä tarkistuslennon ja PP2-kokeen tilan. Kun oppilaalla on kaikki valmista, kortin oikeaan yläkulmaan ilmestyy vihreä piste.'],
    ['img', 'instructor-02-oppilaat.png', 'Kuva 3. Kerhon oppilaat -näkymä edistymispalkkeineen.'],
    ['p', 'Klikkaa oppilaan korttia avataksesi oppilaan yksityiskohtaisen näkymän. Siellä näet kaikki lennot, teorian, varusteet ja liitteet.'],
    ['img', 'instructor-03-oppilaan-tiedot.png', 'Kuva 4. Oppilaan yksityiskohtainen näkymä.'],

    ['h1', '4. Lennon kirjaaminen'],
    ['p', 'Oppilaan tietonäkymässä on "+ Lisää lento" -painike. Painikkeen takaa aukeaa lomake, johon syötetään päivä, lentopaikka, tyyppi (matala/korkea), lentojen määrä, sää, harjoitukset ja muistiinpanot. Jos lento on tarkistuslento, ruksi "Tarkistuslento"-valintaruutu — päivämäärä tallentuu oppilaan tarkistuslentotietoon.'],
    ['img', 'instructor-04-lennon-lisays.png', 'Kuva 5. Lennon lisäyslomake.'],
    ['p', 'Tallennuksen jälkeen lento näkyy oppilaan lentolistassa ja päivittää edistymispalkkeja. Voit poistaa virheellisen lennon lentolistan "Poista"-painikkeella.'],

    ['h1', '5. Oppitunnit'],
    ['p', 'Oppituntinäkymässä voit luoda uusia oppitunteja, lisätä niihin osallistuvia oppilaita ja merkitä käsiteltyjä teoria-aiheita. Oppitunnit näkyvät myös audit-lokissa.'],
    ['img', 'instructor-05-oppitunnit.png', 'Kuva 6. Oppitunnit-näkymä.'],

    ['h1', '6. Lentopaikat'],
    ['p', 'Hallinnoi kerhosi lentopaikkoja "Lentopaikat"-näkymässä. Voit lisätä, muokata ja poistaa paikkoja. Lentopaikkoja käytetään lentokirjausten lomakkeessa.'],
    ['img', 'instructor-06-lentopaikat.png', 'Kuva 7. Lentopaikat-näkymä.'],

    ['h1', '7. Teoria'],
    ['p', 'Teoria on jaettu PP1- ja PP2-tasoihin, jotka sisältävät osioita ja yksittäisiä aiheita. Ohjaajana voit merkitä aiheen suoritetuksi oppilaalle oppitunnin tai yksittäisen merkinnän kautta. Pääkäyttäjä voi myös muokata teorian rakennetta.'],
    ['img', 'instructor-07-teoria.png', 'Kuva 8. Teoria-näkymä.'],

    ['h1', '8. Käyttö mobiilissa'],
    ['p', 'Kun käytät sovellusta puhelimella, sivuvalikko piiloutuu ja vasempaan yläkulmaan ilmestyy hampurilaispainike (☰). Paina sitä avataksesi valikon. Oppilaat-näkymässä kortit muuttuvat pystysuuntaisiksi ja lentolista pinoutuu helposti luettaviksi korteiksi.'],
    ['img', 'instructor-08-mobiili-oppilaat.png', 'Kuva 9. Oppilaat-näkymä mobiilissa.', { maxWidth: 320 }],
    ['img', 'instructor-09-mobiili-valikko.png', 'Kuva 10. Hampurilaispainikkeesta avautuva sivuvalikko.', { maxWidth: 320 }],

    ['h1', '9. Vinkkejä'],
    ['ul', [
      'Käytä "Kesken"-suodatinta oppilasnäkymässä nähdäksesi vain aktiiviset oppilaat.',
      'Oppilaan status "Valmis" vaatii suoritetun PP2-kokeen — jos et pääse tallentamaan, tarkista että PP2-koe on merkitty suoritetuksi.',
      'Tarkistuslennon ja PP2-kokeen suorituspäivät näkyvät oppilaan statuksen vieressä ja oppilaan detail-näkymässä.',
      'Liian monta epäonnistunutta kirjautumisyritystä lukitsee IP-osoitteen 15 minuutiksi — odota tai käytä toista verkkoa.'
    ]],

    ['h1', '10. Ongelmatilanteet'],
    ['p', 'Jos kirjautuminen ei onnistu, varmista käyttäjänimen kirjoitusasu (ääkköset huomioiden). Jos sivu ei reagoi, päivitä selain (F5 / Ctrl+R). Pidempiaikaisissa ongelmissa ota yhteyttä kerhon pääkäyttäjään tai sovelluksen ylläpitoon.']
  ]
};

const student = {
  title: 'PilottiPolku – Käyttöohje oppilaalle',
  subtitle: 'Varjoliidon koulutuksen seuranta',
  blocks: [
    ['h1', 'Tervetuloa'],
    ['p', 'PilottiPolku on kerhosi koulutusjärjestelmä, jossa voit seurata omaa edistymistäsi: näet lentosi, teorian suoritukset ja etenemisesi kohti PP1- ja PP2-tasoja. Tämä ohje kertoo, miten pääset alkuun.'],
    ['p', 'Sovellus toimii selaimessa osoitteessa https://pilottipolku.fi. Voit käyttää sitä tietokoneella, tabletilla tai puhelimella.'],

    ['h1', '1. Kirjautuminen'],
    ['p', 'Ohjaajasi antaa sinulle käyttäjänimen ja alkusalasanan. Kirjaudu sisään etusivulta. Jos unohdit salasanasi, käytä "Unohtuiko salasana?" -linkkiä — saat palautuslinkin sähköpostiisi.'],
    ['img', '01-login.png', 'Kuva 1. Kirjautumisnäkymä.'],
    ['p', 'Ensimmäisellä kerralla järjestelmä voi pyytää sinua vaihtamaan salasanan. Valitse vähintään 8 merkkiä pitkä salasana, jota kukaan muu ei voi arvata.'],

    ['h1', '2. Omat tiedot'],
    ['p', 'Kirjautumisen jälkeen pääset automaattisesti omaan profiiliisi. Siellä näet:'],
    ['ul', [
      'Edistymisesi: matalat ja korkeat lennot, tarkistuslennon tila, PP2-kokeen tila',
      'Kaikki kirjatut lentosi päivittäin',
      'Teorian suoritustilanteen PP1- ja PP2-tasoittain',
      'Varusteesi (siipi, valjaat, varavarjo)'
    ]],
    ['img', 'student-01-omat-tiedot.png', 'Kuva 2. Oppilaan oma näkymä.'],
    ['p', 'Lentojen kirjaaminen tapahtuu yleensä ohjaajan toimesta, mutta voit myös itse lisätä lennon "+ Lisää lento" -painikkeella. Lomakkeessa valitaan päivä, lentopaikka, tyyppi (matala/korkea), lentojen määrä, sää ja harjoitukset.'],

    ['h1', '3. Lentopaikat'],
    ['p', '"Lentopaikat"-näkymässä näet kaikki kerhosi lentopaikat ja niiden kuvaukset. Näitä paikkoja käytetään lennon kirjauksen lomakkeella.'],
    ['img', 'student-02-lentopaikat.png', 'Kuva 3. Lentopaikat-näkymä.'],

    ['h1', '4. Teoria'],
    ['p', 'Teoria-näkymässä näet kaikki PP1- ja PP2-tasojen teoria-aiheet. Suoritetut aiheet näkyvät merkittyinä. Ohjaajasi merkitsee aiheet suoritetuksi oppituntien tai itsenäisen opiskelun jälkeen.'],
    ['img', 'student-03-teoria.png', 'Kuva 4. Teoria-näkymä.'],

    ['h1', '5. Käyttö mobiilissa'],
    ['p', 'Puhelimella käytettäessä sivuvalikko piiloutuu ja vasempaan yläkulmaan ilmestyy hampurilaispainike (☰). Paina sitä avataksesi navigoinnin. Lentolista pinoutuu helposti luettaviksi korteiksi pienellä ruudulla.'],

    ['h1', '6. Vinkkejä'],
    ['ul', [
      'Tarkista säännöllisesti, että kaikki lentosi on kirjattu oikein — ilmoita ohjaajalle, jos huomaat puutteita.',
      'Vihreä piste oppilaslistalla kertoo, että kaikki kurssin vaatimukset ovat täyttyneet.',
      'Voit vaihtaa salasanasi milloin tahansa profiilin kautta. Älä jaa salasanaasi kenenkään kanssa.',
      'Jos olet lentänyt ulkomailla tai toisessa kerhossa, pyydä ohjaajaa kirjaamaan lennot puolestasi.'
    ]],

    ['h1', '7. Ongelmatilanteet'],
    ['p', 'Jos kirjautuminen ei onnistu, tarkista käyttäjänimen ja salasanan kirjoitusasu. Jos sivu ei reagoi, päivitä selain (F5). Ongelmatilanteissa ota yhteyttä omaan ohjaajaasi.']
  ]
};

// ---------- Render helpers ----------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderBlocks(blocks) {
  const out = [];
  for (const block of blocks) {
    const [type, ...rest] = block;
    if (type === 'h1') {
      const text = rest[0];
      out.push(`<h1 id="${slugify(text)}">${escapeHtml(text)}</h1>`);
    } else if (type === 'h2') {
      out.push(`<h2>${escapeHtml(rest[0])}</h2>`);
    } else if (type === 'p') {
      out.push(`<p>${escapeHtml(rest[0])}</p>`);
    } else if (type === 'ul') {
      const items = rest[0].map(i => `  <li>${escapeHtml(i)}</li>`).join('\n');
      out.push(`<ul>\n${items}\n</ul>`);
    } else if (type === 'img') {
      const [filename, caption, opts = {}] = rest;
      const maxW = opts.maxWidth || 640;
      out.push(
        `<figure>\n` +
        `  <img src="img/${escapeHtml(filename)}" alt="${escapeHtml(caption)}" style="max-width: ${maxW}px;">\n` +
        `  <figcaption>${escapeHtml(caption)}</figcaption>\n` +
        `</figure>`
      );
    }
  }
  return out.join('\n\n');
}

const CSS = `
  :root {
    --blue-dark: #1A3A5C;
    --blue-mid: #2E6DA4;
    --gray-bg: #F2F5F9;
    --text: #1F2937;
    --muted: #6B7280;
    --border: #E5E7EB;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
    background: var(--gray-bg);
    margin: 0;
    line-height: 1.6;
  }
  .header {
    background: var(--blue-dark);
    color: #fff;
    padding: 20px 24px;
    text-align: center;
  }
  .header h1 { margin: 0 0 6px 0; font-size: 26px; }
  .header .subtitle { opacity: 0.85; font-size: 15px; font-style: italic; }
  .container {
    max-width: 820px;
    margin: 0 auto;
    background: #fff;
    padding: 40px 48px 64px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  h1 {
    color: var(--blue-dark);
    border-bottom: 2px solid var(--blue-mid);
    padding-bottom: 6px;
    margin-top: 42px;
    font-size: 24px;
  }
  h2 { color: var(--blue-mid); margin-top: 28px; font-size: 19px; }
  p { margin: 10px 0; }
  ul { margin: 10px 0 16px 0; }
  li { margin: 4px 0; }
  figure {
    margin: 20px 0 24px;
    text-align: center;
  }
  figure img {
    width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }
  figcaption {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
    font-style: italic;
  }
  .toc {
    background: #F8FAFC;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 20px;
    margin: 20px 0 30px;
  }
  .toc h2 { margin: 0 0 8px 0; font-size: 15px; color: var(--text); }
  .toc ul { margin: 0; padding-left: 18px; list-style: none; }
  .toc li::before { content: "›  "; color: var(--muted); }
  .toc a { color: var(--blue-mid); text-decoration: none; }
  .toc a:hover { text-decoration: underline; }
  .backlink {
    display: inline-block;
    margin-top: 24px;
    color: var(--blue-mid);
    text-decoration: none;
  }
  .backlink:hover { text-decoration: underline; }
  @media (max-width: 640px) {
    .container { padding: 24px 18px 48px; }
    .header { padding: 16px; }
    .header h1 { font-size: 20px; }
  }
`;

function renderToc(blocks) {
  const items = blocks
    .filter(b => b[0] === 'h1')
    .map(b => `    <li><a href="#${slugify(b[1])}">${escapeHtml(b[1])}</a></li>`)
    .join('\n');
  return `<nav class="toc">\n  <h2>Sisällys</h2>\n  <ul>\n${items}\n  </ul>\n</nav>`;
}

function renderDoc(guide) {
  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(guide.title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="header">
    <h1>${escapeHtml(guide.title)}</h1>
    <div class="subtitle">${escapeHtml(guide.subtitle)}</div>
  </header>
  <main class="container">
${renderToc(guide.blocks)}

${renderBlocks(guide.blocks)}

    <a href="/" class="backlink">← Takaisin sovellukseen</a>
  </main>
</body>
</html>
`;
}

fs.writeFileSync(path.join(OUT_DIR, 'ohjaaja.html'), renderDoc(instructor));
console.log('Wrote public/docs/ohjaaja.html');
fs.writeFileSync(path.join(OUT_DIR, 'oppilas.html'), renderDoc(student));
console.log('Wrote public/docs/oppilas.html');
