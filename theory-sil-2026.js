// SIL varjoliidon koulutusohjelman mukaiset tietopuoliset aiheet.
// Lähde: Suomen Ilmailuliitto ry, Varjoliidon koulutusohjelma 11.5.2026
// https://ilmailuliitto.fi/wp-content/uploads/2024/10/varjoliidon_koulutusohjelma_11_5_2026.pdf
//
// Rakenne vastaa koulutusohjeen pykäliä 4.3 (PP1 tietopuolinen koulutus)
// ja 5.3 (PP2 tietopuolinen koulutus) sellaisenaan — otsikot ja kohdat.
// MOVA-aiheet elävät omana rakenteenaan server.js:n MOVA-migraatiossa.

const SIL_2026_THEORY = [
  // ============================================================================
  // PP1 — § 4.3 Tietopuolinen koulutus
  // ============================================================================
  { level: 'pp1', key: 'pp1_aero', title: 'Aerodynamiikka', topics: [
    { key: 'pp1_aero_1', title: 'Vaakalennossa vaikuttavat voimat (painovoima, nostovoima, vastus; hinauksessa hinausvoima)', dur: 45 },
    { key: 'pp1_aero_2', title: 'Nostovoima, sen riippuvuus ilmanopeudesta ja kohtauskulmasta', dur: 30 },
    { key: 'pp1_aero_3', title: 'Kolme akselia (poikittais-, pituus-, pystyakseli) ja lentovakavuus', dur: 30 },
    { key: 'pp1_aero_4', title: 'Liitimen kohtauskulma ja painopisteen sijainti siipeen nähden', dur: 30 },
    { key: 'pp1_aero_5', title: 'Ohjausperiaatteet: perusliikkeet ja korjaukset', dur: 30 },
    { key: 'pp1_aero_6', title: 'Ilmanopeus/maanopeus: miksi lentoonlähtö ja lasku tehdään vastatuuleen', dur: 30 },
    { key: 'pp1_aero_7', title: 'Sakkaukset: vaarat, tunnistaminen, välttäminen ja oikaisu', dur: 45 },
    { key: 'pp1_aero_8', title: 'Siiven kärkipyörre ja pintavaikutus', dur: 30 },
  ]},
  { level: 'pp1', key: 'pp1_meteo', title: 'Mikrometeorologia', topics: [
    { key: 'pp1_meteo_1', title: 'Tuulen synty ja maanpinnan epätasaisen lämpenemisen vaikutus', dur: 30 },
    { key: 'pp1_meteo_2', title: 'Tuulen mittaus: nopeus, suunta (vasta-, myötä-, sivutuuli)', dur: 30 },
    { key: 'pp1_meteo_3', title: 'Tuulen voima ja sen vaarat (maassa, lentoonlähdössä, ilmassa, laskussa)', dur: 30 },
    { key: 'pp1_meteo_4', title: 'Tuuligradientti: vaikutus ja vaarat, ohjaaminen tuuligradientissa', dur: 30 },
    { key: 'pp1_meteo_5', title: 'Epätasainen tuuli (puuskat, pyörteet, nosteet)', dur: 30 },
    { key: 'pp1_meteo_6', title: 'Pyörteet: mekaaniset, termiikin ja tuulen muutosten aiheuttamat', dur: 30 },
    { key: 'pp1_meteo_7', title: 'Turvallisten ja vaarallisten olosuhteiden tunnistaminen', dur: 30 },
  ]},
  { level: 'pp1', key: 'pp1_equip', title: 'Liidin ja välineet', topics: [
    { key: 'pp1_equip_1', title: 'Rakenne ja nimitykset: materiaalit ja osat', dur: 45 },
    { key: 'pp1_equip_2', title: 'Lentokelpoisuusvaatimukset: liitimen tyyppitodistus', dur: 15 },
    { key: 'pp1_equip_3', title: 'Huolto: päivittäiset ja määräaikaiset tarkastukset', dur: 30 },
    { key: 'pp1_equip_4', title: 'Liitimen valinta: painorajat, luokat (alkeis/keskitaso/kilpa)', dur: 30 },
    { key: 'pp1_equip_5', title: 'Valjaiden valinta: eri valjastyypit', dur: 30 },
    { key: 'pp1_equip_6', title: 'Muut varusteet: kypärä, jalkineet, käsineet, pelastusvarjo', dur: 30 },
    { key: 'pp1_equip_7', title: 'Hinausvälineet: hinauskytkin, hinauspuntari, hinausnaru, taittopyörä', dur: 30 },
  ]},
  { level: 'pp1', key: 'pp1_human', title: 'Inhimilliset tekijät', topics: [
    { key: 'pp1_human_1', title: 'Fyysiset seikat: kunto, väsymys, huumeiden ja alkoholin vaikutus', dur: 30 },
    { key: 'pp1_human_2', title: 'Psykologiset seikat: motivaatio, pelot, henkilökohtaiset paineet, itsekuri', dur: 30 },
    { key: 'pp1_human_3', title: 'Oppiminen ja ympäristö: opettelumenetelmät, tavoitteet, motivaatio', dur: 30 },
    { key: 'pp1_human_4', title: 'Ilmailija: oppilaan ja pilotin eron selventäminen', dur: 15 },
  ]},
  { level: 'pp1', key: 'pp1_rules', title: 'Säännöt ja määräykset', topics: [
    { key: 'pp1_rules_1', title: 'Ilmailuviranomainen, ilmailumääräykset ja -tiedotteet', dur: 30 },
    { key: 'pp1_rules_2', title: 'Suomen Ilmailuliitto ry: hallitus, Liidintoimikunta (LIT), SIL:n ohjeet', dur: 30 },
    { key: 'pp1_rules_3', title: 'Varjoliitokerhot: kerhon säännöt ja ohjeet', dur: 15 },
    { key: 'pp1_rules_4', title: 'Varjoliidon lentopaikat: paikallismääräykset ja -ohjeet', dur: 30 },
    { key: 'pp1_rules_5', title: 'Hyvän käytöksen säännöt', dur: 15 },
  ]},
  { level: 'pp1', key: 'pp1_safety', title: 'Lentotoiminta ja turvallisuus', topics: [
    { key: 'pp1_safety_1', title: 'Lennon suunnittelu: arviointi ja päätökset (lentopäätös, lentosuunnitelma)', dur: 30 },
    { key: 'pp1_safety_2', title: 'Lennonvalmistelu: vakiotarkastukset, kaksinkertaiset tarkistukset', dur: 30 },
    { key: 'pp1_safety_3', title: 'Vaaratilanteet: syyt, tunnistaminen, välttäminen ja toiminta vaaratilanteissa', dur: 60 },
  ]},

  // ============================================================================
  // PP2 — § 5.3 Tietopuolinen koulutus
  // ============================================================================
  { level: 'pp2', key: 'pp2_aero', title: 'Aerodynamiikka', topics: [
    { key: 'pp2_aero_1', title: 'Ensimmäisen asteen kertaus', dur: 30 },
    { key: 'pp2_aero_2', title: 'Nostovoima: siipiprofiilit, siipipinta-ala, sivusuhde, ilman tiheyden vaikutus', dur: 45 },
    { key: 'pp2_aero_3', title: 'Lentämisen periaate: pysähtyminen ja peruuttaminen mahdotonta', dur: 15 },
    { key: 'pp2_aero_4', title: 'Kaltevan tason periaate', dur: 15 },
    { key: 'pp2_aero_5', title: 'Ilmanvastus: muoto-, indusoitu ja interferenssivastus', dur: 30 },
    { key: 'pp2_aero_6', title: 'Kaarrot: kaartojen suorittaminen', dur: 30 },
    { key: 'pp2_aero_7', title: 'Sakkaukset: lentoonlähdössä, puuskissa, turbulenssissa, tuuligradientissa', dur: 45 },
    { key: 'pp2_aero_8', title: 'Nopeuspolaarit: minimivajoama, paras liitoluku, jarrujen ja speed barin käyttö', dur: 45 },
    { key: 'pp2_aero_9', title: 'Tuulisortuma ja sen korjaaminen', dur: 30 },
    { key: 'pp2_aero_10', title: 'Laskukierros: myötätuuli-, perus- ja finaaliosa', dur: 30 },
  ]},
  { level: 'pp2', key: 'pp2_meteo', title: 'Sääoppi', topics: [
    { key: 'pp2_meteo_1', title: 'Ensimmäisen asteen kertaus', dur: 30 },
    { key: 'pp2_meteo_2', title: 'Ilmamassat ja säärintamat: korkea-/matalapaine, rintamat, stabiili/labiili, inversio', dur: 60 },
    { key: 'pp2_meteo_3', title: 'Paikallisolosuhteet: tasamaa, laaksot, vuoristo, rannikko', dur: 30 },
    { key: 'pp2_meteo_4', title: 'Merituuli: syntyminen ja vaikutukset', dur: 15 },
    { key: 'pp2_meteo_5', title: 'Rinnetuuli: vaikuttajat, parhaan noston alue, roottorit, kova tuuli', dur: 45 },
    { key: 'pp2_meteo_6', title: 'Vuoristo-olosuhteet: vuoristotermiikki, vuoristoaallot, roottorit', dur: 45 },
    { key: 'pp2_meteo_7', title: 'Termiikki: vaikuttajat, tunnusmerkit, vaarat, turvalliset olosuhteet', dur: 60 },
    { key: 'pp2_meteo_8', title: 'Rintamanosto', dur: 30 },
    { key: 'pp2_meteo_9', title: 'Tuuligradientti: vaarat', dur: 15 },
    { key: 'pp2_meteo_10', title: 'Pilvet: cumulus, cumulonimbus, stratus, lenticularis, roottori-/lakkipilvet', dur: 30 },
    { key: 'pp2_meteo_11', title: 'Säätiedotukset: METAR, TAF, sääkartat, lentosääpalvelut', dur: 30 },
    { key: 'pp2_meteo_12', title: 'Sään arvioiminen: havainnointi lähtö- ja laskupaikalla ja ilmassa', dur: 30 },
  ]},
  { level: 'pp2', key: 'pp2_equip', title: 'Liidin ja välineet', topics: [
    { key: 'pp2_equip_1', title: 'Ensimmäisen asteen kertaus', dur: 15 },
    { key: 'pp2_equip_2', title: 'Lentokelpoisuusvaatimukset: vakavuus, ohjattavuus, kuormitus (EN-luokat)', dur: 30 },
    { key: 'pp2_equip_3', title: 'Suorituskyky: minimivajoama, paras liitoluku, huippunopeus, speed bar', dur: 30 },
    { key: 'pp2_equip_4', title: 'Ohjattavuus: liitimen vastaaminen ohjausliikkeisiin akselien suhteen', dur: 30 },
    { key: 'pp2_equip_5', title: 'Mittarit: variometri, korkeusmittari, GPS', dur: 30 },
    { key: 'pp2_equip_6', title: 'Vaatetus ja varusteet pitkällä/korkealla/kylmässä lennolla', dur: 15 },
    { key: 'pp2_equip_7', title: 'Erilaiset hinausjärjestelmät: auto-, moottorikelkka, vintturit, kitkakelat', dur: 30 },
  ]},
  { level: 'pp2', key: 'pp2_human', title: 'Inhimilliset tekijät', topics: [
    { key: 'pp2_human_1', title: 'Ensimmäisen asteen kertaus', dur: 15 },
    { key: 'pp2_human_2', title: 'Liitimen päällikkö: ilmailuasenteet, luonteenpiirteet, vastuu, velvollisuudet', dur: 30 },
    { key: 'pp2_human_3', title: 'Psyykkiset tekijät: jännittäminen, itseluottamus, omat rajat, stressi', dur: 30 },
    { key: 'pp2_human_4', title: 'Lentosuoritus: jatkuvat arvioinnit ja päätökset lennolla', dur: 30 },
    { key: 'pp2_human_5', title: 'Fyysiset tekijät: huimaus ja ylihengitys', dur: 30 },
  ]},
  { level: 'pp2', key: 'pp2_rules', title: 'Säännöt ja määräykset', topics: [
    { key: 'pp2_rules_1', title: 'Ensimmäisen asteen kertaus', dur: 15 },
    { key: 'pp2_rules_2', title: 'Lentosäännöt, AIP, NOTAM, AIC, ICAO-lentokartat, internet-palvelut', dur: 45 },
    { key: 'pp2_rules_3', title: 'Väistämissäännöt varjo- ja riippuliitimille (rinne- ja termiikkilennossa)', dur: 30 },
    { key: 'pp2_rules_4', title: 'Hinaustoimintaohje (SIL)', dur: 30 },
    { key: 'pp2_rules_5', title: 'Ilmatila ja muu ilmaliikenne: valvottu/valvomaton, VFR/IFR, rajoitukset', dur: 60 },
    { key: 'pp2_rules_6', title: 'Ilmailuradioliikenne: taajuudet, käyttöluvat, kelpuutukset', dur: 30 },
  ]},
  { level: 'pp2', key: 'pp2_safety', title: 'Lentotoiminta ja turvallisuus', topics: [
    { key: 'pp2_safety_1', title: 'Ensimmäisen asteen kertaus', dur: 15 },
    { key: 'pp2_safety_2', title: 'Lennon suunnittelu: ilmatila ja -liikenne, hätä- ja pakkotilanteet', dur: 30 },
    { key: 'pp2_safety_3', title: 'Vaaratilanteet: syyt, tunnistaminen, välttäminen (kriittiset lentoliikkeet, olosuhteet, asenteet)', dur: 60 },
    { key: 'pp2_safety_4', title: 'Toiminta hätätilanteissa: pelastusvarjon käyttö, erikoisluontoiset laskut, vaaratilanneraportti', dur: 60 },
    { key: 'pp2_safety_5', title: 'Toiminta toisen joutuessa onnettomuuteen: ensiapu, ilmoittaminen', dur: 30 },
  ]},
];

// Vanhojen (ennen SIL-migraatiota 2026) topic-avainten mäppäys uusiin.
// Käytetään vain migraatiossa; uusia keyjä käytetään suoraan uusissa asennuksissa.
// null = ei mäppäystä (vastaava suoritus poistetaan — oli aiheessa jota SIL ei vaadi).
const OLD_TO_NEW_TOPIC_MAP = {
  // PP1 Aerodynamiikka (vanha oli 5 topicia, uusi 8)
  'pp1_aero_1': 'pp1_equip_1',    // "Liitimen rakenne ja toiminta" → välineet rakenne
  'pp1_aero_2': 'pp1_aero_2',     // Nostovoima ja vastus → Nostovoima
  'pp1_aero_3': 'pp1_aero_2',     // Lentonopeudet (osa nostovoimaa)
  'pp1_aero_4': 'pp1_aero_7',     // Sakkaus → Sakkaukset
  'pp1_aero_5': 'pp1_aero_5',     // Kääntyminen ja painonsiirto → Ohjausperiaatteet

  // PP1 Mikrometeorologia (vanha 5, uusi 7)
  'pp1_meteo_1': 'pp1_meteo_1',   // Tuulen perusteet → Tuulen synty
  'pp1_meteo_2': 'pp2_meteo_7',   // Terminen aktiivisuus → PP2 Termiikki (ei PP1-aihe)
  'pp1_meteo_3': 'pp1_meteo_4',   // Turbulenssi ja tuuligradientti → Tuuligradientti
  'pp1_meteo_4': 'pp2_meteo_11',  // Sääennusteiden lukeminen → PP2 Säätiedotukset
  'pp1_meteo_5': 'pp2_meteo_3',   // Paikallissääilmiöt → PP2 Paikallisolosuhteet

  // PP1 Välineet (vanha 4, uusi 7)
  'pp1_equip_1': 'pp1_equip_1',   // Liitimen osat → Rakenne ja nimitykset
  'pp1_equip_2': 'pp1_equip_5',   // Valjaat ja varavarjo → Valjaiden valinta
  'pp1_equip_3': 'pp1_equip_6',   // Kypärä ja suojavarusteet → Muut varusteet
  'pp1_equip_4': 'pp1_equip_3',   // Välineiden tarkastus → Huolto

  // PP1 Säännöt ja ilmatila (vanha 5, uusi 5) — mutta sisällöt siirtyvät
  'pp1_rules_1': 'pp1_rules_1',   // Ilmailulaki → Ilmailuviranomainen
  'pp1_rules_2': 'pp2_rules_5',   // Ilmatilarakenne → PP2 Ilmatila (ei PP1)
  'pp1_rules_3': 'pp2_rules_2',   // NOTAM → PP2 ilmailutiedotteet (ei PP1)
  'pp1_rules_4': 'pp2_rules_3',   // Väistämissäännöt → PP2 (ei PP1)
  'pp1_rules_5': 'pp1_rules_2',   // SIL:n ohjeet → Suomen Ilmailuliitto

  // PP1 Lentotekniikka (ei SIL-tietopuolista) — ei suoraa uutta vastinetta,
  // mutta mapped siihen suuntaan että oppilaalla jotain kirjautunee uuteen rakenteeseen
  'pp1_tech_1': null,  // Maassa tapahtuva harjoittelu → käytännön koulutus (ei teoriaa)
  'pp1_tech_2': null,  // Nousu ja laskeutuminen → käytännön
  'pp1_tech_3': null,  // Suuntaohjaus
  'pp1_tech_4': null,  // Laskeutumiskuviot
  'pp1_tech_5': null,  // Top-landing

  // PP1 Turvallisuus
  'pp1_safety_1': 'pp1_safety_1', // Riskienhallinta → Lennon suunnittelu
  'pp1_safety_2': 'pp1_safety_3', // Hätätilanteet → Vaaratilanteet
  'pp1_safety_3': 'pp2_safety_4', // Varavarjon käyttö → PP2 Toiminta hätätilanteissa
  'pp1_safety_4': 'pp2_safety_5', // Ensiapu → PP2 Toiminta onnettomuudessa
  'pp1_safety_5': 'pp2_safety_5', // Onnettomuusraportointi → PP2 sama

  // PP2 Aerodynamiikka
  'pp2_aero_1': 'pp2_aero_8',     // Profiilipolaaridiagrammit → Nopeuspolaarit
  'pp2_aero_2': 'pp2_aero_8',     // Liitosuhde ja sink rate → Nopeuspolaarit
  'pp2_aero_3': null,             // Wingover ja SAT → ei SIL PP2
  'pp2_aero_4': 'pp2_aero_8',     // Speed system ja trim → Nopeuspolaarit
  'pp2_aero_5': 'pp2_equip_2',    // EN-luokitus → Lentokelpoisuusvaatimukset
  'pp2_aero_6': 'pp2_aero_2',     // Siipiprofiilien vertailu → Nostovoima

  // PP2 Meteorologia (vanha 6 → uusi 12)
  'pp2_meteo_1': 'pp2_meteo_11',  // Synoptiikka → Säätiedotukset
  'pp2_meteo_2': 'pp2_meteo_7',   // Termiikka kehittynyt → Termiikki
  'pp2_meteo_3': 'pp2_meteo_2',   // Inversiot ja stabiilisuus → Ilmamassat
  'pp2_meteo_4': 'pp2_meteo_6',   // Vuoristoaallot ja roottori → Vuoristo-olosuhteet
  'pp2_meteo_5': 'pp2_meteo_10',  // Ukkosrintamat → Pilvet (cumulonimbus)
  'pp2_meteo_6': 'pp2_meteo_12',  // Lentosään arviointi → Sään arvioiminen

  // PP2 Navigointi (ei SIL PP2 tietopuolista)
  'pp2_nav_1': null,              // Kartat ja koordinaatistot → PP3+
  'pp2_nav_2': 'pp2_equip_5',     // GPS → Mittarit
  'pp2_nav_3': null,              // XC-reittisuunnittelu → PP3+
  'pp2_nav_4': 'pp2_rules_5',     // Ilmatilarajat → Ilmatila
  'pp2_nav_5': 'pp2_equip_5',     // Vario ja flight computer → Mittarit

  // PP2 Lentotekniikka (käytäntö)
  'pp2_tech_1': null, 'pp2_tech_2': null, 'pp2_tech_3': null,
  'pp2_tech_4': null, 'pp2_tech_5': null, 'pp2_tech_6': null,

  // PP2 Matkalento XC (ei SIL PP2)
  'pp2_xc_1': null, 'pp2_xc_2': null, 'pp2_xc_3': null,
  'pp2_xc_4': null, 'pp2_xc_5': null,

  // PP2 Turvallisuus (vanha 5 → uusi 5 mutta sisällöt siirtyvät)
  'pp2_safety_1': 'pp2_safety_4', // SIV-kurssin teoria → Toiminta hätätilanteissa
  'pp2_safety_2': 'pp2_safety_3', // Kasaantuminen ja cravat → Vaaratilanteet
  'pp2_safety_3': 'pp2_safety_3', // Autorotaatio ja full stall → Vaaratilanteet
  'pp2_safety_4': 'pp2_safety_5', // Läheltä piti -raportointi → Toiminta onnettomuudessa
  'pp2_safety_5': 'pp2_human_3',  // Henkinen valmentautuminen → Psyykkiset tekijät

  // PP2 Inhimilliset tekijät (vanha 6, uusi 5)
  'pp2_human_1': 'pp2_human_5',   // Ihmisen suorituskyky → Fyysiset tekijät
  'pp2_human_2': 'pp2_human_4',   // Päätöksenteko ADM → Lentosuoritus
  'pp2_human_3': 'pp2_human_3',   // Stressinhallinta → Psyykkiset tekijät
  'pp2_human_4': 'pp2_human_5',   // Fyysinen kunto → Fyysiset tekijät
  'pp2_human_5': 'pp2_human_5',   // Hypoksia ja kylmyys → Fyysiset tekijät
  'pp2_human_6': null,            // Ryhmädynamiikka → ei SIL
};

// Vanhat section-avaimet (pp1_tech, pp2_nav, pp2_xc, pp2_tech_adv jne.) jotka
// poistetaan migraatiossa. Lista on migraatiolle idempotenssia varten.
const OLD_PP1_PP2_SECTION_KEYS = [
  'pp1_aero', 'pp1_meteo', 'pp1_equip', 'pp1_rules', 'pp1_tech', 'pp1_safety',
  'pp2_aero_adv', 'pp2_meteo_adv', 'pp2_nav', 'pp2_tech_adv',
  'pp2_xc', 'pp2_safety_adv', 'pp2_human',
];

// Uusien section-avainten joukko — jos tämä avain löytyy, migraatio on jo ajettu.
const NEW_PP1_PP2_SECTION_KEYS = [
  'pp1_aero', 'pp1_meteo', 'pp1_equip', 'pp1_human', 'pp1_rules', 'pp1_safety',
  'pp2_aero', 'pp2_meteo', 'pp2_equip', 'pp2_human', 'pp2_rules', 'pp2_safety',
];

// Migration marker: uuden rakenteen esimerkki-topic-key joka ei esiinny vanhassa.
// Jos tämä löytyy theory_topics_def-taulusta, migraatio on jo ajettu.
const MIGRATION_MARKER_TOPIC_KEY = 'pp1_aero_6'; // "Ilmanopeus/maanopeus" — ei vanhassa rakenteessa (vanhan pp1_aero oli 5 topicia)

module.exports = {
  SIL_2026_THEORY,
  OLD_TO_NEW_TOPIC_MAP,
  OLD_PP1_PP2_SECTION_KEYS,
  NEW_PP1_PP2_SECTION_KEYS,
  MIGRATION_MARKER_TOPIC_KEY,
};
