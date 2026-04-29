# PilottiPolku

Varjoliidon koulutussovellus lentokerhoille — oppilaiden koulutuksen seuranta, suoritusten kirjaus ja kerhokohtainen hallinta.

## Tuotantoympäristö

- **Sovellus:** https://pilottipolku.fi (myös https://www.pilottipolku.fi)
- **Repo:** https://github.com/sorvamaa/lentokerho-app
- **Hosting:** Railway (auto-deploy `main`-branchista, ~30–60s build)
- **Tietokanta:** PostgreSQL (Railwayssa managed-palveluna)

## Tekninen pino

- **Backend:** Node.js 18+ / Express
- **Tietokanta:** PostgreSQL (`pg`-ajuri) — ennen SQLite, migroitu
- **Autentikointi:** `bcryptjs` + `express-session` (PostgreSQL-store)
- **Turva:** Helmet, express-rate-limit
- **Muut:** Multer (tiedostolataukset), Nodemailer (sähköposti), Sentry (virheseuranta)
- **Frontend:** Vanilla HTML/CSS/JS (`public/`-kansiossa)

## Repon rakenne

```
server.js          # Pääbackend — kaikki API-endpointit, seed, migraatiot
db.js              # Tietokantayhteys (pg Pool)
mailer.js          # Sähköpostien lähetys
audit.js           # Audit-lokin apufunktiot
public/            # Frontend (HTML/CSS/JS)
scripts/           # Ylläpitoskriptit
data/              # Staattinen data, tiedostolataukset (data/uploads/)
.env.example       # Ympäristömuuttujien esimerkki
bg-login.jpg       # Kirjautumissivun taustakuva
```

## Skriptit

- `npm start` — käynnistää palvelimen
- `npm run seed` — ajaa seed-datan manuaalisesti (huom: seed ajetaan myös serverin käynnistyksessä)

## Ympäristömuuttujat

Railwayn Environment Variables -osiossa:
- `DATABASE_URL` — PostgreSQL-yhteysosoite
- `SESSION_SECRET` — session-cookien allekirjoitusavain
- `NODE_ENV` — `production` Railwayssa
- Mahdolliset Sentry/Nodemailer-avaimet

Lokaalisti: kopioi `.env.example` → `.env` ja täytä arvot. Lokaali kehitys vaatii oman PostgreSQL-instanssin.

## Roolit ja testitunnukset

Sovelluksessa on kolme roolia: `admin`, `instructor` (ohjaaja), `student` (oppilas).

Ohjaajilla on lisäksi **koulutuspäällikkö**-rooli (`is_chief`): yksi per kerho, voi hallita ohjaajia ja kerhon asetuksia. Admin tai nykyinen koulutuspäällikkö voi siirtää roolin toiselle ohjaajalle. Ensimmäinen kerhoon lisätty ohjaaja saa roolin automaattisesti.

Testiohjaajat (kaikki salasanat `Etunimi123!!`):

| Käyttäjä | Salasana     | Rooli      | Kerho                     | Koulutuspäällikkö |
|----------|--------------|------------|---------------------------|-------------------|
| admin    | admin123     | admin      | —                         | —                 |
| Taavi    | Taavi123!!   | instructor | Hämeenkyrön Lentokerho    | kyllä (oletus)    |
| Marko    | Marko123!!   | instructor | Hämeenkyrön Lentokerho    | ei                |
| Väiski   | Viski123!!   | instructor | FlyDaddy                  | kyllä (oletus)    |
| Jarno    | Jarno123!!   | instructor | Oulun Icaros Team         | kyllä (oletus)    |
| Juho     | Juho123!!    | instructor | Airiston Varjoliitäjät    | kyllä (oletus)    |

**Huom Väiski:** salasana on `Viski123!!` (ei Väiski) — historiallinen UTF-8-encoding-bug.
**Sähköpostit:** kaikki ohjaajat käyttävät `@example.com`-osoitteita tietosuojan vuoksi.

## Deployment

1. Commit + push `main`-branchiin
2. Railway buildaa ja deployaa automaattisesti
3. Odota ~30–60 sekuntia
4. Testaa https://pilottipolku.fi

Ei erillistä staging-ympäristöä — `main` = tuotanto. Tällä hetkellä sovellus on **testikäytössä** eikä sisällä oikeaa dataa.

## Käynnistyksessä ajettavat migraatiot

`server.js`:n alussa käynnistyksessä ajetaan seuraavat (järjestyksessä):

1. Seed-data luodaan jos tietokanta on tyhjä (käyttäjät, kerhot, testidata)
2. Schema-migraatiot (ALTER TABLE IF NOT EXISTS):
   - `users.is_chief` — koulutuspäällikkö-rooli
   - `clubs.contact_email`, `contact_phone`, `website`, `logo_path` — kerhon tiedot
   - `flights.approved`, `approved_by`, `approved_at` — lentojen hyväksyntä
   - `club_settings`-taulu — kerhokohtaiset asetukset (`require_flight_approval`)
   - Ensimmäinen ohjaaja per kerho asetetaan automaattisesti koulutuspäälliköksi
3. Email-privacy-migraatio — ohjaajien emailit pakotetaan `@example.com`-osoitteiksi
4. Väiski-password-migraatio — korjaa double-encoded salasana-hashin
5. UTF-8-fix — korjaa double-encoded ääkköset `name`- ja `username`-kentissä PostgreSQL-komennolla `convert_from(convert_to(x, 'LATIN1'), 'UTF8')`. Early-return jos dataa ei ole jo vioittunut.

## Tunnetut yksityiskohdat

### Rate limiter
`loginLimiter` sallii tuotannossa 30 ja devissä 50 **epäonnistunutta** kirjautumisyritystä per 15 min per IP. `skipSuccessfulRequests: true` — onnistuneet loginit eivät kuluta kiintiötä, joten normaalikäyttö ei lukitse tiliä.

### UTF-8-encoding
Vanhasta SQLite-vaiheesta periytyi double-encoded merkkejä tietokantaan (esim. `VÃ¤iski`). Startup-migraatio korjaa nämä automaattisesti jos niitä löytyy. Älä poista migraatiota.

### Seed vs. oikea data
**Seed-logiikka ajetaan joka käynnistyksessä.** Kun sovellus joskus otetaan tuotantokäyttöön, seed pitää muuttaa ehdolliseksi (älä ylikirjoita olemassaolevaa dataa). Nyt tämä on OK koska kaikki on testidataa.

### Railway-deploy
Kontin uudelleenkäynnistys ei hävitä dataa — PostgreSQL on managed-palveluna erikseen. Koodin deploy ei kosketa dataa.

### Cache busting
`index.html` servoidaan Express-reitin kautta, joka injektoi `?v=<timestamp>` -queryn `app.js`- ja `style.css`-tageihin palvelimen käynnistyshetkellä. Jokainen deploy invalidoi selaimen välimuistin automaattisesti.

### Koulutuspäällikkö (is_chief)
Yksi per kerho. Oikeudet: ohjaajien lisäys/poisto, kerhon asetukset (lentojen hyväksyntä, kerhon tiedot/logo). Admin tai nykyinen koulutuspäällikkö voi siirtää roolin toiselle ohjaajalle (`PUT /api/instructors/:id/set-chief`). Ensimmäinen kerhoon lisätty ohjaaja saa roolin automaattisesti.

### Lentojen hyväksyntä
Kerhokohtainen asetus (`club_settings.require_flight_approval`). Kun päällä: ohjaajan lisäämät lennot hyväksytään automaattisesti, oppilaan itse lisäämät jäävät tilaan `approved = NULL` (odottaa). Vain hyväksytyt lennot (`approved = 1`) lasketaan edistymistilastoissa (`getStudentStats`). Ohjaaja hyväksyy/hylkää lennon UI:sta.

### Kerhon tiedot ja logo
Koulutuspäällikkö voi muokata kerhon nimeä, kuvausta, yhteystietoja ja verkkosivua (`PUT /api/my-club`). Logo (JPG/PNG) tallennetaan `data/uploads/` -kansioon ja servoidaan `GET /api/clubs/:id/logo`. Logo näkyy asetussivulla ja lentopäiväkirjan PDF-tulosteessa.

## Konventiot

- **Kieli:** suomi UI:ssa ja kommenteissa, englanti muuttuja/funktionimissä
- **Koodityyli:** perus JavaScript, ei TypeScriptiä, ei lintteriä
- **Commit-viestit:** lyhyt englanninkielinen aktiivimuoto ("Add weather field to flights")
- **Git-flow:** suoraan `main`-branchiin, ei feature-brancheja (yksi kehittäjä)
- **Testit:** ei automaattisia testejä — testaus selaimessa tuotantoa vasten
- **Tietokantamuutokset:** käytä `ALTER TABLE` / ehdollisia migraatioita, älä `DROP + CREATE`

## Kehityssuunnitelmia

Tulevaisuudessa tehtäväksi ennen tuotantokäyttöä:
- Seed-logiikan erottaminen tuotantodatasta (tarkista onko data jo olemassa)
- Automaattiset PostgreSQL-backupit
- `NODE_ENV`-perusteinen seed-ehtoisuus
- Staging-ympäristön erottaminen mainista (branch `develop`?)

## Hyödyllisiä kysymyksiä Claudelle

- "Tutustu server.js:ään ja kerro mitkä ovat pääendpointit"
- "Lisää oppilaalle sääkentät lentoon (tuuli, näkyvyys) — päivitä schema, API ja frontend"
- "Testaa login/logout kaikilla testitunnuksilla"
- "Committaa muutokset viestillä X ja pushaa"
