# Architettura del backend

## Realtime – mappa con posizioni simulate

Socket.IO montato sullo stesso server HTTP dell'API (`src/server.ts`), codice in
`src/modules/realtime/`:

| File | Contenuto |
|---|---|
| `zones.ts` | Unica fonte delle zone consentite (6 città dell'Emilia-Romagna, raggio 5 km, tolleranza 150 m) |
| `geo.ts` | `distanceM` (haversine) e `isInAllowedZone` |
| `socket.ts` | `attachRealtime(httpServer, { loadUser?, staleMs? })`: handshake, eventi, stato in memoria |

I client (soccorritori e ispettori) **simulano** la propria posizione nel browser e la
inviano una volta al secondo. Non viene usata la geolocalizzazione reale.
L'operatore riceve le posizioni di tutti e le mostra sulla mappa.

### Regole

- **Identità sempre dal token.** Il JWT arriva nell'handshake (`auth`), non in query string,
  così non finisce nei log del proxy. Il server verifica firma, scadenza e ruolo (solo
  `OPERATORE`, `SOCCORRITORE`, `ISPETTORE`) e legge il `fullName` dal DB, rifiutando gli
  utenti cancellati. Nessun evento accetta `userId`, `role` o `name` dal client: eventuali
  campi in più nel payload vengono ignorati.
- **Isolamento lato server.** Solo i socket `OPERATORE` vengono messi dal server nella room
  `operators`, e tutti gli eventi `presence:*` vengono emessi solo lì. Un client non può
  entrare in una room da solo, quindi un client modificato non riceve le posizioni altrui.
- **Validazione degli update.** Ruolo, numeri finiti, posizione dentro una zona, almeno
  500 ms dall'ultimo update accettato. Gli `OUT_OF_ZONE` vengono loggati come `warn` e fanno
  anche da controllo sulla simulazione del client.
- **Una scheda per utente** (come WhatsApp Web), per tutti e tre i ruoli. Ogni scheda ha un
  `tabId` casuale in `sessionStorage`, che sopravvive a F5 ma è diverso per ogni scheda.
  - Se l'utente ha già un socket con un **altro** `tabId` e non c'è `takeover`, il server
    rifiuta con `ALREADY_OPEN`.
  - Con `takeover: true` ("Usa qui") il vecchio socket riceve `session:replaced` e viene chiuso.
  - Se il `tabId` è lo **stesso** (F5, riconnessione), il vecchio socket viene sostituito
    senza `session:replaced`.
  - In ogni caso la posizione dell'utente viene rimossa (`presence:remove`) e ricompare al
    primo update del nuovo socket.
  - È una regola di interfaccia, non di sicurezza: le API REST rispondono anche dalla scheda
    bloccata. Lato server, però, c'è sempre un solo socket per utente.
- **Scadenza del token.** Al connect parte un timer su `exp`: allo scadere il server emette
  `session:expired` e chiude il socket.
- **Posizioni scadute.** Ogni secondo vengono rimosse le posizioni senza update da più di
  `PRESENCE_STALE_MS` (default 10000 ms).

### Contratto Socket.IO

Path `/socket.io`, namespace di default, stessa origine del frontend.
Il frontend tiene una copia dei tipi in `src/realtime/contract.ts`, da allineare a mano.

| Evento | Direzione | Payload | Ruoli | Note |
|---|---|---|---|---|
| *(handshake)* | C → S | `auth: { token: string, tabId: string, takeover?: boolean }` | tutti | `connect_error.message`: `UNAUTHORIZED` (token mancante, non valido o scaduto; `tabId` mancante; utente inesistente; ruolo sconosciuto), `ALREADY_OPEN` (altra scheda aperta), `UNAVAILABLE` (DB non raggiungibile: va trattato come errore temporaneo, **non** come logout) |
| `session:replaced` | S → C | `{}` | tutti | Un'altra scheda ha premuto "Usa qui"; segue la chiusura del socket |
| `session:expired` | S → C | `{}` | tutti | Segue la chiusura del socket |
| `location:config` | S → C | `{ zones: {id, name, lat, lng, radiusM}[], intervalMs: 1000 }` | SOCCORRITORE, ISPETTORE | Inviato subito dopo il connect |
| `location:update` | C → S | `{ lat: number, lng: number }` + ack opzionale `({ ok: true } \| { ok: false, code })` | SOCCORRITORE, ISPETTORE | `code`: `FORBIDDEN_ROLE`, `INVALID_PAYLOAD`, `OUT_OF_ZONE`, `RATE_LIMITED` |
| `presence:snapshot` | S → C | `{ users: Presence[] }` | OPERATORE | Inviato al connect |
| `presence:update` | S → room `operators` | `Presence` | OPERATORE | Uno per ogni update accettato |
| `presence:remove` | S → room `operators` | `{ userId: number, reason: "DISCONNECTED" \| "STALE" }` | OPERATORE | |

```ts
type Presence = {
  userId: number;
  fullName: string;
  role: "SOCCORRITORE" | "ISPETTORE";
  lat: number;
  lng: number;
  updatedAt: string; // ISO, orologio del server
};
```

Il logout non ha un evento dedicato: il client chiude il socket e il server lo gestisce
nel `disconnect`.

### Niente CORS

Il frontend e l'API sono sulla stessa origine grazie al proxy (Vite in sviluppo, nginx in
produzione), e Socket.IO segue la stessa strada su `/socket.io`. Per questo il server
Socket.IO non ha l'opzione `cors`.

### Limiti

- **Una sola istanza del backend.** Socket e posizioni vivono in memoria (`Map`). Con più
  istanze servirebbe un adapter condiviso (es. Redis), fuori ambito.
- **Nessuna persistenza.** Si tiene solo l'ultima posizione; dopo un riavvio i client si
  riconnettono e i punti ricompaiono al primo update.
- **Due schede che si collegano nello stesso istante** possono superare entrambe il controllo
  `ALREADY_OPEN`: vince l'ultima, la prima riceve `session:replaced`. Resta comunque un solo
  socket per utente.
- **Schede in background.** Il browser rallenta i timer delle schede nascoste. L'operatore
  vede sparire il punto per timeout, e il punto torna quando la scheda torna visibile.

### Test

`tests/unit/geo.test.ts` e `tests/integration/realtime.test.ts` (senza DB né chain).
Richiedono Node ≥ 22; senza Node locale si possono lanciare nel container:

```sh
docker compose -f docker-compose.dev.yml run --rm --no-deps -e SKIP_DB_SETUP=true api npm run test:integration
```
