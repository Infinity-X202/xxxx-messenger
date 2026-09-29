# Crittografia

## Transport encryption

TLS tra browser e Cloudflare (e, se configurato, verso l’origin). Protegge la rete. **Non** è E2EE: operatori del reverse proxy / TLS possono vedere il traffico in chiaro al punto di terminazione.

## Encryption at rest

Volume Docker / disco host. Postgres può usare cifratura disco del provider. Non sostituisce E2EE: chi ha accesso al DB vede i ciphertext (e metadati).

## End-to-end encryption (fase 8, architettura attiva)

- Coppia ECDH P-256 generata nel browser (Web Crypto), **non estraibile**, in IndexedDB.
- La **private key non viene inviata** al server.
- `devices.public_key` memorizza solo SPKI pubblica.
- Il campo `messages.ciphertext` contiene un envelope JSON (`AES-GCM` + chiavi wrappate per deviceId).
- Il server **non** decifra i corpi messaggio.

### Cosa funziona oggi

- Invio/ricezione 1:1 con wrapping per i dispositivi registrati dei membri.
- Fallback `mode: "compat"` solo se **nessun** device è registrato (allora il JSON include plaintext lato applicazione — **non è E2EE**; va evitato in produzione assicurandosi che ogni client registri un device al login).

### Cosa manca per E2EE completa tipo Signal

- Protocollo Double Ratchet / X3DH
- Sender keys per gruppi
- Backup/recovery delle identity key (es. passphrase)
- Verifica safety number / fingerprint tra utenti
- Sealed sender e deniability
- Multi-device sync delle chiavi storiche (i messaggi vecchi non si leggono su un browser nuovo senza le chiavi)
- Cifratura degli allegati (oggi metadati + file a riposo sul volume, autorizzati per membership)

Non sono stati inventati algoritmi proprietari: solo Web Crypto (ECDH P-256, AES-GCM).
