# Pilottipolku — kehitysideat

Kerätty palautekanavista (demokokeiluista, keskusteluista).

Priorisointi:
- 🔴 **kriittinen** · ilman tätä jokin on rikki tai pahasti puutteellista
- 🟡 **hyödyllinen** · parantaa arkikäyttöä selvästi
- 🟢 **nice-to-have** · tulevaisuutta varten
- ❓ **selvitettävä** · idea elää vielä, kirkastettava ennen päätöstä

---

## Oppilaan motivaatio ja innostaminen

- 🟡 **Virstanpylväät (ei saavutuksia pelimäisesti):** oppilaalle näkyy luontevasti milloin hän saavuttaa jotain merkittävää — ensimmäinen matala, ensimmäinen korkea, 10. korkealento, 50. kokonaislento, 1 h kokonaisajassa, ensimmäinen tarkkari. Yksinkertainen bannerinauhojen rivi profiilissa riittää, ei pelimäisiä palkintoja.
  Ehdottaja: Claude (2026-10-06). Tavoite: oppilas kokee edistymisen konkreettisesti.

- 🟡 **"Oma kehitys"-näkymä oppilaalle:** profiilisivulla graafinen aikajana — kuukausittain lentomäärä palkkeina, teoria-aiheet pisteinä, keskeiset merkkipaalut nostettuina. Näyttää missä on nyt + miten tähän on tultu.
  Ehdottaja: Claude (2026-10-06). Yhdistyy Markkun "where you are / what's next" -ideaan — tämä on "where you've been".

- 🟢 **Jaettavat statut-kortit:** oppilas voi generoida kuvan "Lentelin tänään ensimmäisen korkealennon! 🪂" jaettavaksi WhatsAppissa/somessa. Luodaan serverillä PNG. Vapaaehtoinen, oppilas painaa itse.
  Ehdottaja: Claude (2026-10-06). Rekryvoima — oppilas kehuu kerhoa itse somessa.

- ❓ **Kerhon aikajana / feedi:** näkee anonymisoituna/nimettynä muiden kerhon oppilaiden merkkipaalut ("Satu teki ensimmäisen tarkkarinsa tänään"). Vahvistaa yhteisöllisyyttä.
  Ehdottaja: Claude (2026-10-06). Selvitettävää: haluavatko kaikki oppilaat olla näkyvillä? Tietosuoja + opt-out.

## Oppilaan hallinta
<!-- (ei vielä ehdotuksia) -->

## Lennon kirjaus

- 🟡 **Session-tason lentokirjaus:** mahdollisuus kirjata koko koulutussessio yhdellä dialogilla kaikille oppilaille kerralla, ei oppilaskohtaisesti.
  Ehdottaja: Markku Mastomäki (demo-palaute 2026-10-05). Taustaa: Itä-Porvoossa vastuuopettaja käy kirjaamassa lennot ja jättää lokitiedon — koko sessio samasta ikkunasta tuntuisi luontevalta.
  Toteutushuomioita: yksi lomake, jossa päivä + lentopaikka + ohjaaja + sää yhteiset, sitten lista läsnäolleet oppilaat ja kullekin oma rivi (lentomäärä matalat/korkeat/moottori + mahdollinen tarkkari-merkki + lyhyt kommentti). Tallennus avaa taustalla usean lennon kirjauksen.

- 🔴 **Mobile-first lentokirjaus:** nykyinen lomake toimii mobiilissa mutta on työläs. Kentänlaidalla pitää saada lento kirjattua ~15 sekunnissa: iso "+ Lento" -nappi, oletukset esillä (päivä = tänään, paikka = viimeisin), tyyppi radio-napeilla (ei pudotusvalikosta), lennon määrä stepperi (1/2/3), tallennus näkyvällä nappilla.
  Ehdottaja: Claude (2026-10-06). Suorin tie tavoitteeseen "lento tulee kirjattua heti".

- 🟡 **Sää-autofill:** Jos lentopaikan koordinaatit tiedossa, haetaan FMI:n Open Data -APIsta tuulen suunta ja nopeus, lämpötila, pilvisyys automaattisesti kirjauksen päivälle+ajalle. Oppilas voi vielä muokata.
  Ehdottaja: Claude (2026-10-06). FMI:n sääasema-API on ilmainen ja luotettava.

- 🟡 **Jälkikirjaus-prompt:** kun oppilas kirjaa lennon, sen jälkeen pieni dialogi: "Mitä opit? Mitä harjoittelit? Mitä kokeilet seuraavaksi?" — kolme pientä kenttää, kaikki vapaaehtoisia mutta ne tulevat yleensä täytetyksi kun ne kysytään heti.
  Ehdottaja: Claude (2026-10-06). Suorin tie tavoitteeseen "kommentteja kirjataan".

- 🟡 **Lennon tyypit + harjoitukset tagattavina:** katso erillinen osio [Taitojen seuranta](#taitojen-seuranta--lentoharjoitukset). Lennon kirjauksen yhteydessä valitaan mitkä harjoitukset tehtiin.
  Ehdottaja: Claude (2026-10-06). Yhdistyy harjoituslistan kanssa.

- 🟢 **"Sama kuin viime kerta" -oikotie:** napilla kopioi edellisen lennon tiedot pohjaksi (paikka, sää, varusteet, tyyppi) — oppilas vain muuttaa määrän. 2-tap kirjaus.
  Ehdottaja: Claude (2026-10-06).

- 🟢 **Offline-tuki (PWA):** service worker tallettaa lennot localStorageen jos ei verkkoa, synkronoi kun yhteys palaa. Kentänlaidalla usein huono kuuluvuus.
  Ehdottaja: Claude (2026-10-06). Tekninen päätös — PWA:n lisääminen on oma projekti, mutta avaa oven monelle muulle asialle (push-notifikaatiot, kotinäyttöön asennus).

## Oppitunnit

- 🟡 **Oppituntipohjat / templatit:** valmiit mallit yleisimmistä oppitunneista — "PP1 starttipäivä", "PP2 teoriapäivä: sääoppi", "Tarkkariviikonloppu". Pohjassa on esivalitut aiheet, oletusteksti muistiinpanoihin, ja ehdotus kestosta. Ohjaaja luo oppitunnin pohjasta → täyttää oppilaat → tallentaa suunnitelmaksi.
  Ehdottaja: Claude (2026-10-06). Suorin tie tavoitteeseen "sujuvoittaa oppituntien pitämistä". Oppituntipohjat voivat olla kerhokohtaisia tai yhteisiä.

- 🟡 **Kattavuusnäkymä: mitä aiheita vielä puuttuu per oppilas:** ohjaajalle näkymä josta näkee nopeasti "nämä oppilaat tarvitsevat vielä nämä aiheet". Antaa pohjan seuraavan oppitunnin suunnittelulle.
  Ehdottaja: Claude (2026-10-06). Vastaa tavoitteeseen "varmistaa että oppitunneilla käydään oikeita asioita läpi".

- 🟡 **Oppitunnin tavoitteet / oppimistulokset:** jokaisessa oppitunnissa kenttä "mitä tällä oppitunnilla tavoitellaan?". Pidetyn oppitunnin yhteenvedossa automaattinen check: "aiheet X ja Y käsiteltiin, Z jäi". Myös oppilaalle näkyväksi.
  Ehdottaja: Claude (2026-10-06).

- 🟢 **"Edellisen oppitunnin yhteenveto" oppilaalle:** oppilaan dashboardissa näkyy mitä viimeksi tehtiin oppitunnilla ja mitä se tarkoittaa hänelle (hänen progression kannalta).
  Ehdottaja: Claude (2026-10-06).

## Taitojen seuranta / lentoharjoitukset

- 🔴 **Harjoituskatalogin kokoaminen:** oma strukturoitu lista lennoilla opeteltavista taidoista: korvat, heiluri, käännökset (loivat/90°/180°/360°), B-stall, spiraali, maalaantuminen, startti erilaisissa olosuhteissa, pyörteiden välttäminen jne. Jaettu PP1/PP2/MOVA-tasolle. Pohjaksi kannattanee hakea SIU:n virallinen koulutuslista + kerhon oma täydennys.
  Ehdottaja: Claude (2026-10-06, Markon pyyntö). **Edellytys muille tämän osion ideoille.** Vaatii koostamista käsin — tekninen puoli on helppo, mutta sisältö pitää saada paikkansapitäväksi.

- 🟡 **Harjoitusten tagaus lennon kirjauksen yhteydessä:** oppilas tai ohjaaja valitsee lennon kirjauksen yhteydessä mitkä harjoitukset tällä lennolla tehtiin. Lento → "Mitä harjoittelit?" → checkboxit katalogista.
  Ehdottaja: Claude (2026-10-06). Rakentuu harjoituskatalogin päälle. Vastaa tavoitteeseen "pitää huoli että lennoille opetellaan tietyt jutut".

- 🟡 **Taitojen edistymisnäkymä oppilaalle:** profiilissa osio "Taidot" jossa näkyy jokainen harjoitus + montako kertaa tehnyt + viimeksi + ohjaajan merkintä "osaa/kesken/vaatii harjoitusta". Visuaalinen taitopuu.
  Ehdottaja: Claude (2026-10-06).

- 🟡 **Ohjaajan arviointi harjoituksesta:** ohjaaja voi oppilaan profiilista kuitata "Satu osaa isot korvat — vihreä". Tai lentokirjauksen jälkeen "arvioi harjoitukset" -nappi. Yksinkertainen 3-tason mittari (kokeillut / osaa auttavasti / sujuvaa).
  Ehdottaja: Claude (2026-10-06).

- 🟢 **"Seuraava harjoittele tämä" -ehdotus:** oppilaan dashboardissa ehdotettu seuraava harjoitus hänen tasoonsa nähden ("Olet tehnyt 20 korkealentoa, kokeiletko seuraavaksi loivaa 90° käännöstä?"). Puoliautomaattinen — ohjaaja voi myös suoraan asettaa tavoitteen.
  Ehdottaja: Claude (2026-10-06). Yhdistyy Markkun "where next" -ideaan.

- 🟢 **Harjoitusten vaatimukset valmistumiseen:** osa harjoituksista voisi olla pakollisia valmistumiselle (esim. "20 korkealentoa, joista vähintään 3 kattaa seuraavat harjoitukset: X, Y, Z"). Täydentää nykyistä "40 korkealentoa" -kriteeriä.
  Ehdottaja: Claude (2026-10-06). Vaatii päätöksen kriteereistä — kannattaa jutella SIU:n ohjaaja­koulutuksen kanssa.

## Teoria ja oppimateriaali

- 🟡 **Teoria-aiheille linkit ja materiaalit:** jokaiseen teoria-aiheeseen voisi liittää ulkoisia linkkejä (artikkelit, PDF:t) joista oppilas voi omatoimisesti opiskella.
  Ehdottaja: Markku Mastomäki (2026-10-05).

- 🟢 **YouTube-kirjasto:** videoita teoria-aiheiden tueksi. Voisi liittyä yllä olevaan "linkit"-ideaan — oma kategoria vai sulautettu?
  Ehdottaja: Markku Mastomäki (2026-10-05).

- 🟡 **Perusmateriaalipaketti valmiina Pilottipolussa + kerhokohtaiset lisät:** jokaisessa Pilottipolku-instanssissa olisi valmis "ydinkokoelma" oppimateriaaleja (linkit perusvideoihin, keskeiset artikkelit, viralliset määräykset), ja jokainen kerho voi lisätä omia materiaaleja omaan osioonsa.
  Ehdottaja: Marko (2026-10-06, Markkun ideoiden pohjalta jalostettu).
  Toteutushuomioita:
  - Perusmateriaali: pysyvä, Pilottipolun ylläpitämä kokoelma (päivitykset tulevat deployn mukana).
  - Kerhokohtaiset materiaalit: kerho hallitsee itse omaa listaa — kannattaa yhdistää [[aineisto-ja-ajankohtaista]] (ks. UI/UX-osio) kanssa.

- 🟡 **Oppitunnista linkit relevantteihin materiaaleihin:** kun oppitunnilla käydään tietyt teoria-aiheet, oppitunnin näkymässä näkyy automaattisesti linkit niihin liittyviin materiaaleihin (perusmateriaali + mahdollinen kerhokohtainen).
  Ehdottaja: Marko (2026-10-06). Avainhyöty: oppilas voi kotona katsoa "mitä käsiteltiin eilen" ja syventää, tai tarkistaa oppitunnilla läpi käytyjä asioita myöhemmin.
  Toteutushuomioita: `theory_topics_def`-taululle lisätään linkkikenttä (tai erillinen `theory_topic_materials`-taulu), joka näkyy automaattisesti oppitunnin näkymässä kun aihe on osa oppituntia.

## Oppilaan oma polku ja itseopiskelu

- 🟢 **Personoitu opintopolku oppilaalle:** "olet tässä kohtaa, seuraavaksi katso nämä videot / lue tämä". Oppilaan omassa näkymässä selkeä "mitä seuraavaksi" -näkymä.
  Ehdottaja: Markku Mastomäki (2026-10-05). Lähellä Markon omaa visiointia itseopiskelupaketista — kannattaa suunnitella rinnakkain.

- 🟡 **Oppilas-first-näkökulma:** suunnittelua kannattaa katsoa enemmän oppilaan näkökulmasta — "sellainen jossa oppilas haluaa itse käydä seuraamassa edistymistään ja oppimassa uutta".
  Ehdottaja: Markku Mastomäki (2026-10-05). Enemmän periaate kuin yksittäinen feature.

## Kurssitodistus / valmistuminen
<!-- (ei vielä ehdotuksia) -->

## MOVA-koulutus
<!-- (ei vielä ehdotuksia) -->

## UI/UX / navigaatio
<!-- (ei vielä ehdotuksia) -->

## Audit / loki / historiatieto

- ❓ **Tarkempi ja selkeämmin päivittyvä loki:** jokin aktiviteettiloki, josta näkee kuka teki mitä ja milloin. Nykyinen `audit_log` on olemassa mutta ei näy hyvin UI:ssa.
  Ehdottaja: Markku Mastomäki (2026-10-05). Taustakommentti liittyi "Googlen versionhallintaan" — Markku epävarma mitä se tekee rosiksessa, mutta ajatus clear activity logista.
  Selvitettävää: millainen näkymä, kelle (chief vai kaikki ohjaajat?), tarvitaanko pelkkä feed vai myös suodatus/haku?

## Muuta / ei vielä kategoriaa

- ✅ **Yleispalaute Markkulta:** "ehdottoman kannatettava projekti", "ihan pätevältä näyttää". Ei vaadi toimenpiteitä, mutta hyvä muistaa että demo+käyttöönottokynnys on oikealla tasolla.

---

## Toteutettu

<!-- Siirrä ideat tänne niiden toteutuksen jälkeen, mainitse committi / PR -->
