# Piano: più persone nella stessa app

Stato: deciso, da costruire.

## Cosa si vuole ottenere

- Un solo indirizzo per tutti. Ognuno apre la stessa app e vede solo la sua roba.
- Chi è la persona lo decide la chiave messa nel telefono, non l'indirizzo.
- Io ho tutte le chiavi e il codice (token). Da un menu scelgo la persona, vedo la sua scheda e apro l'editor su di lei.
- Posso prendere quello che ho nella mia libreria (esercizi, descrizioni, video) e metterlo nella sua.
- Tutto quello che è di una persona è cifrato con la sua chiave: scheda, preparazioni, libreria, descrizioni, note, video.

## Come funziona

**Il codice e i dati sono separati.** Il codice dell'app (`app.js`, `editor.js`, grafica) è uguale per tutti e non contiene dati personali. Non si cifra: il telefono lo deve leggere per farlo funzionare.

**Tutti i dati stanno nel mio repository**, sul ramo `scheda`. C'è un file per persona, cifrato con la sua chiave (AES-GCM, la stessa cifratura di oggi).

**Il nome del file si ricava dalla chiave**, con un calcolo che va solo in un senso. Esempio: `persone/8f3a91c2.json`. Nel repository non compare nessun nome. Il parente inserisce solo la chiave, e l'app trova il suo file da sola.

**I video di una persona** stanno in `persone/<suo file>/video/`, cifrati con la sua chiave.

**Un solo codice (token)**, il mio. I parenti non lo hanno: possono solo leggere. Non possono rompere né la loro scheda né l'app.

## I passi

1. **Persone.** Ogni persona è una chiave, più un nome che vedo solo io. Il repository fisso in `app.js` (righe 12-16) diventa "il file della persona scelta". Si toccano circa trenta punti.

2. **Dati separati nel telefono.** Il piano salvato nel telefono (`wk-store-v1`), le modifiche non salvate e i video scaricati per l'uso senza rete diventano uno per persona. Passando da una persona all'altra niente si mescola. Il salvataggio scrive sempre e solo nel file della persona scelta.

3. **Menu.** Un elenco in alto con una persona per ogni chiave. Tocco un nome e vedo la sua scheda. L'editor si apre sulla persona scelta. Il telefono di un parente ha una sola persona: il menu non compare.

4. **Copia dalla mia libreria alla sua.**
   - Prima i testi: nome, descrizione, varianti.
   - Poi i video: l'app li apre con la mia chiave, li richiude con la sua e li carica nella sua cartella. Il parente vede il video senza avere la mia chiave.

5. **Il mio piano di oggi** (`scheda.json`) passa allo stesso schema, come persona "io". Il vecchio file resta finché non ho controllato che è tutto a posto.

6. **Cambia chiave.** Un tasto per ogni persona. Crea una chiave nuova, ricifra il file e i video con la nuova chiave, e toglie quelli vecchi. Il vecchio collegamento smette di funzionare e mando quello nuovo.

## Le chiavi

- Le chiavi dei parenti le crea l'app: a caso, così due persone non possono averne una uguale.
- Sono fatte per essere scritte su un foglio: gruppi corti, senza caratteri che si confondono (niente 0 e O, niente 1 e l).
- L'app mostra la chiave di ogni persona, così posso copiarla sul foglio. Il foglio è la copia di riserva: se perdo il telefono, le chiavi si rimettono a mano.
- Il parente riceve un collegamento con la chiave dentro. Lo apre una volta e la chiave resta nel suo telefono. La chiave sta nella parte del collegamento dopo il `#`, che non viene mai inviata a nessun server.

## Limiti da sapere

- Chi apre l'app senza codice può fare 60 letture all'ora verso GitHub. Per guardare la propria scheda bastano. Già oggi funziona così.
- Se si perdono sia il foglio sia i telefoni, i dati di quella persona non si possono più aprire. Non esiste un modo per recuperarli.
