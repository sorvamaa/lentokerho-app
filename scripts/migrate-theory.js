// Migration script: populates theory_sections and theory_topics_def
// with the original hardcoded theory topics.
// Safe to run multiple times — skips if data already exists.

const { initDb, getDb, saveNow } = require('../db');

async function migrate() {
  const db = await initDb();

  // Check if already migrated
  const count = db.prepare('SELECT COUNT(*) as c FROM theory_sections').get().c;
  if (count > 0) {
    console.log(`Theory sections already populated (${count} sections). Skipping.`);
    process.exit(0);
  }

  const theorySections = [
    // PP1 sections
    { level: 'pp1', key: 'aero', title: 'Aerodynamiikka', sort: 0, topics: [
      { key: 'pp1_aero_1', title: '1. Nostovoima ja ilmanvastus', dur: 45, comment: null },
      { key: 'pp1_aero_2', title: '2. Siipiprofiili ja polar-käyrä', dur: 45, comment: null },
      { key: 'pp1_aero_3', title: '3. Hyötysuhde ja putoamiskorkeus', dur: 45, comment: null },
      { key: 'pp1_aero_4', title: '4. Painon vaikutus lentoominaisuuksiin', dur: 30, comment: null },
      { key: 'pp1_aero_5', title: '5. Kallistuskulma ja kääntösäde', dur: 30, comment: null },
      { key: 'pp1_aero_6', title: '6. Turbulenssit ja kuolleita alueita', dur: 45, comment: null },
    ]},
    { level: 'pp1', key: 'weather', title: 'Mikrometeorologia', sort: 1, topics: [
      { key: 'pp1_weather_1', title: '1. Ilman tiheys ja sen vaikutukset', dur: 45, comment: null },
      { key: 'pp1_weather_2', title: '2. Lämpötila ja kosteus lentoliikeissä', dur: 45, comment: null },
      { key: 'pp1_weather_3', title: '3. Tuulen muodostuminen ja mittaus', dur: 45, comment: null },
      { key: 'pp1_weather_4', title: '4. Nousut ja laskut, termiikit', dur: 45, comment: null },
      { key: 'pp1_weather_5', title: '5. Sääennusteet ja kylmä rintama', dur: 30, comment: null },
      { key: 'pp1_weather_6', title: '6. Turbulenssiolosuhteet ja vaarallinen sää', dur: 45, comment: null },
    ]},
    { level: 'pp1', key: 'equipment', title: 'Liidin ja välineet', sort: 2, topics: [
      { key: 'pp1_equip_1', title: '1. Liidin rakenne ja osat', dur: 45, comment: null },
      { key: 'pp1_equip_2', title: '2. Harnaisten säädöt ja istumaasento', dur: 30, comment: null },
      { key: 'pp1_equip_3', title: '3. Kuormitus ja välineiden kunto', dur: 30, comment: null },
      { key: 'pp1_equip_4', title: '4. Varjojen tarkastus ja huolto', dur: 45, comment: null },
      { key: 'pp1_equip_5', title: '5. Apuvarjo ja turvavarusteet', dur: 30, comment: null },
      { key: 'pp1_equip_6', title: '6. Kypärä ja näkyvyys, suojavälineet', dur: 30, comment: null },
    ]},
    { level: 'pp1', key: 'human', title: 'Inhimilliset tekijät', sort: 3, topics: [
      { key: 'pp1_human_1', title: '1. Fyysinen kunto ja väsymys', dur: 45, comment: null },
      { key: 'pp1_human_2', title: '2. Psyykkinen valmius ja stressi', dur: 45, comment: null },
      { key: 'pp1_human_3', title: '3. Päätöksenteko ja riskiarviointi', dur: 45, comment: null },
      { key: 'pp1_human_4', title: '4. Disorientaatio ja orientaatio ilmassa', dur: 30, comment: null },
      { key: 'pp1_human_5', title: '5. Tottuminen ja harjoittelu', dur: 30, comment: null },
    ]},
    { level: 'pp1', key: 'rules', title: 'Säännöt ja määräykset', sort: 4, topics: [
      { key: 'pp1_rules_1', title: '1. Ilmailu-alan lainsäädäntö', dur: 45, comment: null },
      { key: 'pp1_rules_2', title: '2. Lentoluvat ja koulutus', dur: 30, comment: null },
      { key: 'pp1_rules_3', title: '3. Vakuutus ja vastuut', dur: 30, comment: null },
      { key: 'pp1_rules_4', title: '4. Lentokiellot ja rajoitukset', dur: 30, comment: null },
      { key: 'pp1_rules_5', title: '5. Melu ja muut ympäristöasiat', dur: 30, comment: null },
      { key: 'pp1_rules_6', title: '6. Tapaturmien raportointi', dur: 30, comment: null },
    ]},
    { level: 'pp1', key: 'operations', title: 'Lentotoiminta ja turvallisuus', sort: 5, topics: [
      { key: 'pp1_ops_1', title: '1. Ennen lentoa tehtävät tarkastukset', dur: 45, comment: null },
      { key: 'pp1_ops_2', title: '2. Liitolaukaus ja ensimmäiset kierrokset', dur: 45, comment: null },
      { key: 'pp1_ops_3', title: '3. Käännökset ja kiivet', dur: 45, comment: null },
      { key: 'pp1_ops_4', title: '4. Laskeutuminen ja maahantulo', dur: 45, comment: null },
      { key: 'pp1_ops_5', title: '5. Hätätapaukset ja poikkeamat', dur: 45, comment: null },
    ]},

    // PP2 sections
    { level: 'pp2', key: 'aero2', title: 'Aerodynamiikka', sort: 0, topics: [
      { key: 'pp2_aero_1', title: '1. Polaari-käyrät ja energia', dur: 45, comment: null },
      { key: 'pp2_aero_2', title: '2. Vajoaa ja nousua, energiahöyryt', dur: 45, comment: null },
      { key: 'pp2_aero_3', title: '3. Maksimisuoritus ja tehokkuus', dur: 45, comment: null },
      { key: 'pp2_aero_4', title: '4. Liidin käyttäytyminen rasituksissa', dur: 45, comment: null },
      { key: 'pp2_aero_5', title: '5. Aerodynaaminen stabiilius', dur: 45, comment: null },
      { key: 'pp2_aero_6', title: '6. Pintailmiöt ja rajakerroskäyttäytyminen', dur: 45, comment: null },
    ]},
    { level: 'pp2', key: 'weather2', title: 'Mikrometeorologia', sort: 1, topics: [
      { key: 'pp2_weather_1', title: '1. Synoptinen meteorologia', dur: 45, comment: null },
      { key: 'pp2_weather_2', title: '2. Paikallisten olosuhteiden ennustaminen', dur: 45, comment: null },
      { key: 'pp2_weather_3', title: '3. Rajakerrosta ja kumivoima', dur: 45, comment: null },
      { key: 'pp2_weather_4', title: '4. Vaara-ilmiöt: downer ja downburst', dur: 45, comment: null },
      { key: 'pp2_weather_5', title: '5. Ristikon tuulet ja paikalliset vaikutukset', dur: 45, comment: null },
      { key: 'pp2_weather_6', title: '6. Sää vuodenaikain perusteella', dur: 30, comment: null },
    ]},
    { level: 'pp2', key: 'equipment2', title: 'Liidin ja välineet', sort: 2, topics: [
      { key: 'pp2_equip_1', title: '1. Liidin tekninen kehitys', dur: 45, comment: null },
      { key: 'pp2_equip_2', title: '2. Eri liidityypit ja niiden käyttö', dur: 45, comment: null },
      { key: 'pp2_equip_3', title: '3. Korjaaminen ja harnaisten asetukset', dur: 30, comment: null },
      { key: 'pp2_equip_4', title: '4. Kuormituksen optimointi', dur: 30, comment: null },
      { key: 'pp2_equip_5', title: '5. Varavarjo ja sen käyttö', dur: 45, comment: null },
      { key: 'pp2_equip_6', title: '6. Erityisvälineet ja tietokoneet', dur: 30, comment: null },
    ]},
    { level: 'pp2', key: 'human2', title: 'Inhimilliset tekijät', sort: 3, topics: [
      { key: 'pp2_human_1', title: '1. Korkeuden vaikutukset ja hypoksia', dur: 45, comment: null },
      { key: 'pp2_human_2', title: '2. Kognitiiviset viat ja tunnel vision', dur: 45, comment: null },
      { key: 'pp2_human_3', title: '3. Ryhmädynamiikka ja johtajuus', dur: 30, comment: null },
      { key: 'pp2_human_4', title: '4. Pelko ja paniikki', dur: 45, comment: null },
      { key: 'pp2_human_5', title: '5. Väsymys ja kuntoutuminen', dur: 30, comment: null },
    ]},
    { level: 'pp2', key: 'rules2', title: 'Säännöt ja määräykset', sort: 4, topics: [
      { key: 'pp2_rules_1', title: '1. Kansainväliset säännöt', dur: 45, comment: null },
      { key: 'pp2_rules_2', title: '2. Kilpailu ja kilpailuvälineet', dur: 30, comment: null },
      { key: 'pp2_rules_3', title: '3. Ilmavalvonta ja ilmatilarajoitukset', dur: 45, comment: null },
      { key: 'pp2_rules_4', title: '4. Vakuutukset ja korvaukset', dur: 30, comment: null },
      { key: 'pp2_rules_5', title: '5. Turvallisuustutkimukset ja analyysi', dur: 45, comment: null },
      { key: 'pp2_rules_6', title: '6. Oppilaan oikeudet ja velvollisuudet', dur: 30, comment: null },
    ]},
    { level: 'pp2', key: 'operations2', title: 'Lentotoiminta ja turvallisuus', sort: 5, topics: [
      { key: 'pp2_ops_1', title: '1. Korkealentaminen ja korkeuslaskenta', dur: 45, comment: null },
      { key: 'pp2_ops_2', title: '2. Maastolentaminen ja turvallisuus', dur: 45, comment: null },
      { key: 'pp2_ops_3', title: '3. Ryhmälentäminen ja joukkostaatiot', dur: 45, comment: null },
      { key: 'pp2_ops_4', title: '4. Poikkeamien hallinta ja kriisinhallinta', dur: 45, comment: null },
      { key: 'pp2_ops_5', title: '5. Kuolin-analyysit ja oppiminen virheistä', dur: 45, comment: null },
    ]},
    { level: 'pp2', key: 'navigation', title: 'Navigointi ja matkustaminen', sort: 6, topics: [
      { key: 'pp2_nav_1', title: '1. Kartoitus ja kompassi', dur: 45, comment: null },
      { key: 'pp2_nav_2', title: '2. GPS ja elektroninen navigointi', dur: 45, comment: null },
      { key: 'pp2_nav_3', title: '3. Etäisyyden arviointi ilmassa', dur: 30, comment: null },
      { key: 'pp2_nav_4', title: '4. Maatasoitus ja maaperän havainto', dur: 30, comment: null },
      { key: 'pp2_nav_5', title: '5. Yölennot ja näkyvyyden puuttuminen', dur: 30, comment: null },
      { key: 'pp2_nav_6', title: '6. Pitkien matkojen suunnittelu', dur: 45, comment: null },
    ]},
  ];

  let sectionCount = 0;
  let topicCount = 0;

  theorySections.forEach(sec => {
    const res = db.prepare(
      'INSERT INTO theory_sections (level, key, title, sort_order) VALUES (?, ?, ?, ?)'
    ).run(sec.level, sec.key, sec.title, sec.sort);
    const sectionId = res.lastInsertRowid;
    sectionCount++;

    sec.topics.forEach((t, idx) => {
      db.prepare(
        'INSERT INTO theory_topics_def (section_id, key, title, duration_minutes, comment, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(sectionId, t.key, t.title, t.dur, t.comment, idx);
      topicCount++;
    });
  });

  saveNow();
  console.log(`Migration complete: ${sectionCount} sections, ${topicCount} topics created.`);
}

migrate().catch(e => { console.error(e); process.exit(1); });
