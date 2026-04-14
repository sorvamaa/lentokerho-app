# PilottiPolku

Varjoliidon koulutussovellus lentokerhoille — oppilaiden koulutuksen seuranta, suoritusten kirjaus ja kerhokohtainen hallinta.

## Tuotantoympäristö

- **Sovellus:** https://pilottipolku.up.railway.app
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
server.js          # Pääbackend, ~2300 riviä — kaikki API-endpointit, seed, migraatiot
db.js              # Tietokantayhteys (pg Pool)
mailer.js          # Sähköpostien lähetys
audit.js           # Audit-lokin apufunktiot
public/            # Frontend (HTML/CSS/JS)
scripts/           # Ylläpitoskriptit
data/              # Staattinen data
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

Testiohjaajat (kaikki salasanat `Etunimi123!!`):

| Käyttäjä | Salasana     | Rooli      | Kerho                     |
|----------|--------------|------------|---------------------------|
| admin    | admin123     | admin      | —                         |
| Taavi    | Taavi123!!   | instructor | Hämeenkyrön Lentokerho    |
| Marko    | Marko123!!   | instructor | Hämeenkyrön Lentokerho    |
| Väiski   | Viski123!!   | instructor | FlyDaddy                  |
| Jarno    | Jarno123!!   | instructor | Oulun Icaros Team         |
| Juho     | Juho123!!    | instructor | Airiston Varjoliitäjät    |

**Huom Väiski:** salasana on `Viski123!!` (ei Väiski) — historiallinen UTF-8-encoding-bug.
**Sähköpostit:** kaikki ohjaajat käyttävät `@example.com`-osoitteita tietosuojan vuoksi.

## Deployment

1. Commit + push `main`-branchiin
2. Railway buildaa ja deployaa automaattisesti
3. Odota ~30–60 sekuntia
4. Testaa https://pilottipolku.up.railway.app

Ei erillistä staging-ympäristöä — `main` = tuotanto. Tällä hetkellä sovellus on **testikäytössä** eikä sisällä oikeaa dataa.

## Käynnistyksessä ajettavat migraatiot

`server.js`:n alussa käynnistyksessä ajetaan seuraavat (järjestyksessä):

1. Seed-data luodaan jos tietokanta on tyhjä (käyttäjät, kerhot, testidata)
2. Email-privacy-migraatio — ohjaajien emailit pakotetaan `@example.com`-osoitteiksi
3. Väiski-password-migraatio — korjaa double-encoded salasana-hashin
4. UTF-8-fix — korjaa double-encoded ääkköset `name`- ja `username`-kentissä PostgreSQL-komennolla `convert_from(convert_to(x, 'LATIN1'), 'UTF8')`. Early-return jos dataa ei ole jo vioittunut.

## Tunnetut yksityiskohdat

### Rate limiter
`loginLimiter` sallii 20 yritystä 15 minuutissa per IP. Tätä nostettiin aiemmin 5 → 20, jotta kehitystestaus ei jumiudu.

### UTF-8-encoding
Vanhasta SQLite-vaiheesta periytyi double-encoded merkkejä tietokantaan (esim. `VÃ¤iski`). Startup-migraatio korjaa nämä automaattisesti jos niitä löytyy. Älä poista migraatiota.

### Seed vs. oikea data
**Seed-logiikka ajetaan joka käynnistyksessä.** Kun sovellus joskus otetaan tuotantokäyttöön, seed pitää muuttaa ehdolliseksi (älä ylikirjoita olemassaolevaa dataa). Nyt tämä on OK koska kaikki on testidataa.

### Railway-deploy
Kontin uudelleenkäynnistys ei hävitä dataa — PostgreSQL on managed-palveluna erikseen. Koodin deploy ei kosketa dataa.

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
