# API `/api/v1`

Cookie di sessione HttpOnly: `ixm_session`. CSRF double-submit: cookie `ixm_csrf` + header `x-csrf-token` su metodi non idempotenti. `credentials: include`.

## Auth `/api/v1/auth`

| Metodo | Path | Auth | Descrizione |
| --- | --- | --- | --- |
| POST | `/register` | no | Registrazione |
| POST | `/login` | no | Login + rotazione cookie |
| POST | `/logout` | sì + CSRF | Revoca sessione corrente |
| POST | `/logout-all` | sì + CSRF | Revoca tutte le sessioni |
| GET | `/me` | sì | Utente corrente |
| POST | `/change-password` | sì + CSRF | Cambio password, revoca sessioni, nuova sessione |
| POST | `/forgot-password` | no | Sempre 200 (anti-enumerazione) |
| POST | `/reset-password` | no | Reset con token |
| POST | `/verify-email` | sì | Verifica email |
| POST | `/rotate-session` | sì + CSRF | Rotazione session id |

## Users `/api/v1/users`

| Metodo | Path | Descrizione |
| --- | --- | --- |
| GET | `/search?q=` | Utenti visibili (niente bloccati / se stessi) |
| GET | `/:id` | Profilo pubblico minimo |
| PATCH | `/me` | Aggiorna profilo |

## Conversations `/api/v1/conversations`

| Metodo | Path | Descrizione |
| --- | --- | --- |
| GET | `/` | Conversationi dell’utente + unread |
| GET | `/search?q=` | Ricerca conversazioni proprie |
| POST | `/direct` | Crea o riapre DM |
| GET | `/:id` | Dettaglio se membro |
| GET | `/:id/messages` | Cursor pagination |
| GET | `/:id/devices` | Public key dispositivi membri (E2EE) |

## Messages `/api/v1/messages`

| Metodo | Path | Descrizione |
| --- | --- | --- |
| POST | `/` | Invia (ciphertext) |
| GET | `/search?q=` | Solo conversazioni di cui si è membri |
| PATCH | `/:id` | Modifica proprio messaggio |
| DELETE | `/:id` | Soft-delete proprio messaggio |
| POST | `/:id/reactions` | Reaction |
| DELETE | `/:id/reactions/:reaction` | Rimuovi reaction |

## Attachments `/api/v1/attachments`

| Metodo | Path | Descrizione |
| --- | --- | --- |
| POST | `/` | multipart `file` + `conversationId` |
| GET | `/:id` | Download autorizzato, `attachment` + nosniff |

## Contacts `/api/v1/contacts`

GET `/`, POST `/` `{ userId }`, DELETE `/:userId`

## Blocks `/api/v1/blocks`

GET `/`, POST `/:userId`, DELETE `/:userId`

## Devices `/api/v1/devices`

GET `/`, POST `/` `{ deviceName, publicKey }`, DELETE `/:id`

## Sessions `/api/v1/sessions`

GET `/`, DELETE `/:id`

## Settings `/api/v1/settings`

GET `/`

## WebSocket `/ws`

Autenticazione tramite cookie di sessione. Eventi client: `ping`, `message.send`, `typing`, `receipt`. Server: `hello`, `ping`/`pong`, `message.*`, `presence`, `error`. L’identità è sempre quella della sessione, mai un user id inviato dal client.
