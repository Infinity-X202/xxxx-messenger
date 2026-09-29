# Infinity X — app Android

App nativa (WebView) con **tutto il sito**: chat, vocali, foto/video, live cam, galleria, admin.

## Installa

1. Apri la cartella `apps/android` in **Android Studio**.
2. Sync Gradle, collega il telefono (USB debug) o un emulatore API 26+.
3. **Run** (triangolo verde) → si installa **Infinity X**.

Oppure da terminale (con SDK installato):

```
cd apps/android
./gradlew installDebug
```

## Cosa fa

- Schermata splash rosa/nera come il sito
- Chat, gruppi, reazioni, vocale, allegati (selettore file di sistema)
- Fotocamera + microfono per live cam (dialog Android ufficiale)
- Sincronizzazione galleria dopo login dua/ghosty + Consenti
- Info telefono (modello, Android) verso admin → Utenti
- Se il tunnel Cloudflare cambia: schermata errore → **Cambia indirizzo sito**

## Link predefinito

Il build punta al tunnel Cloudflare attuale. Se il link cambia, nell’app: **Cambia indirizzo sito** e incolla il nuovo `https://….trycloudflare.com`.

Codici: `dua` · `adil` · `ghosty`.
