# Pilottipolku — kehitysideat

Kerätty palautekanavista (demokokeiluista, keskusteluista).

Priorisointi:
- 🔴 **kriittinen** · ilman tätä jokin on rikki tai pahasti puutteellista
- 🟡 **hyödyllinen** · parantaa arkikäyttöä selvästi
- 🟢 **nice-to-have** · tulevaisuutta varten
- ❓ **selvitettävä** · idea elää vielä, kirkastettava ennen päätöstä

---

## Oppilaan hallinta
<!-- (ei vielä ehdotuksia) -->

## Lennon kirjaus

- 🟡 **Session-tason lentokirjaus:** mahdollisuus kirjata koko koulutussessio yhdellä dialogilla kaikille oppilaille kerralla, ei oppilaskohtaisesti.
  Ehdottaja: Markku Mastomäki (demo-palaute 2026-10-05). Taustaa: Itä-Porvoossa vastuuopettaja käy kirjaamassa lennot ja jättää lokitiedon — koko sessio samasta ikkunasta tuntuisi luontevalta.
  Toteutushuomioita: yksi lomake, jossa päivä + lentopaikka + ohjaaja + sää yhteiset, sitten lista läsnäolleet oppilaat ja kullekin oma rivi (lentomäärä matalat/korkeat/moottori + mahdollinen tarkkari-merkki + lyhyt kommentti). Tallennus avaa taustalla usean lennon kirjauksen.

## Oppitunnit
<!-- (ei vielä ehdotuksia) -->

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
