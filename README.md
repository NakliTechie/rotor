# Rotor

&#x26AB; **Try it now &rarr; https://rotor.naklitechie.com/**
&#x1F4D6; **Guide &amp; trust notes &rarr; https://rotor.naklitechie.com/guide/**

**A TOTP authenticator in one HTML file.**

No install, no account, no server, no sync service.
Your vault is a folder. Move the folder and your vault moves with it.

Rotor does one thing: rotating TOTP codes. No passwords, no cards, no notes, ever. If you want those, use its sibling [Tijori](https://tijori.naklitechie.com). They share the same engine.

---

## What it does

- Rotating 6/7/8-digit TOTP codes (RFC 6238) — SHA-1, SHA-256, SHA-512, 30s or 60s periods
- Add codes by pasting an `otpauth://` URI or entering the Base32 secret manually
- Glance-grid view with per-code countdown rings, tap-to-copy, next-code preview, pinning
- Every entry is individually encrypted: AES-256-GCM with a random 12-byte nonce
- Key derived via PBKDF2-SHA-256, 600,000 iterations (OWASP 2023 level)
- Vault format is an **append-only event log** — one `.jsonl` file per device, SHA-256 hash-chained
- **Multi-device sync** by any transport: cloud folder, Syncthing, Git, USB, encrypted archive, or **QR sequence** (animated QR, no cable or network)
- Per-field last-writer-wins merge — deterministic, no conflicts, works with files arriving out of order
- Device revocation without re-encrypting the vault
- **FSA primary + OPFS fallback** — vault lives in a folder on desktop, in browser storage on iOS / mobile
- Clipboard auto-clears, idle lock, lock-on-tab-hide
- Self-test on boot — RFC 6238 Appendix B test vectors verified in DevTools console

## What it deliberately isn't

- **No passwords. No cards. No notes. No secure text. No file attachments. No password manager features of any kind.** If you want those, use Tijori.
- **No server.** Vault files never leave the folder (or browser storage) you choose.
- **No account.** There is nothing to log in to.
- **No recovery.** Forget the master password and your vault is gone. Back up.
- **No telemetry, no analytics, no network requests of any kind after page load.**
- **No framework, no build step.** One HTML file plus a 25-line service worker. Open it in a text editor, read every line.

## How it works

| Concern | Solution |
|---|---|
| TOTP | Pure Web Crypto `HMAC-SHA-{1,256,512}`, ~20 lines. Base32 inline, ~15 lines. |
| KDF | PBKDF2-SHA-256, 600,000 iterations |
| Per-event encryption | AES-256-GCM, random 12-byte nonce |
| Hash chain | SHA-256 over previous raw event-line string; `genesis` for first |
| Merge | Union all device streams, sort by `(ts, device_id)`, per-field last-writer-wins |
| Storage | `FileSystemDirectoryHandle` (File System Access API) on desktop; `navigator.storage.getDirectory()` (OPFS) on iOS / mobile |
| Reconnect | FSA handle persisted in IndexedDB (permission re-requested on next visit); OPFS vault name in IndexedDB (no permission needed) |
| Offline | Service worker caches app shell (cache-first, no telemetry) |
| Dependencies | **Zero** |
| Build step | **None** |

## Vault format

```
vault-folder/
  rotor-meta.json                   — plaintext: KDF params, device roster
  rotor-events-<deviceId>.jsonl     — one per device, append-only, hash-chained
```

Each event line:

```json
{
  "seq": 3,
  "prev_hash": "<sha256-of-previous-line>",
  "ts": "2026-04-24T10:22:31.000Z",
  "device_id": "abc123…",
  "event_type": "entry_created",
  "payload_ct": "<base64-aes-gcm-ciphertext>",
  "nonce": "<base64-12-byte-nonce>"
}
```

`payload_ct` is AES-256-GCM ciphertext of the entry payload (JSON). `prev_hash` is SHA-256 of the preceding raw line string. Tampering any byte breaks the chain — verifiable from **Settings → Vault → Verify log integrity**.

Event types: `device_registered`, `device_revoked`, `entry_created`, `entry_updated`, `entry_deleted`.

Details in [`BACKUP-FORMAT.md`](BACKUP-FORMAT.md).

## Usage

1. Open `index.html` in Chrome, Edge, Firefox, or Safari 16.4+.
2. **Create new vault** → pick an empty folder (desktop) or name a browser vault (iOS / Android) → set a device name and master password.
3. **＋ Add code** → paste an `otpauth://` URI to auto-fill everything, or enter the Base32 secret manually.
4. Tap any tile to copy the current code. The ring counts down to the next rotation; the small number below is the next code.
5. Long-press or right-click a tile to pin it to the top.
6. **Back up regularly.** Settings → Data → Export encrypted archive → store the `.rotor` file somewhere safe (a cloud folder is fine — it is AES-encrypted with your master password).
7. **Second device:** open the same vault folder from the new browser, enter the master password, and the device registers itself automatically. Or send via QR from Settings → Data → Send vault via QR.

## Sync

Each device writes only its own `.jsonl` file. Sync is whatever moves files between devices:

| Transport | Notes |
|---|---|
| Cloud folder (iCloud Drive / Dropbox / Google Drive) | Easiest. Each device's browser points at its local copy. |
| Syncthing | P2P, no cloud. |
| Git | Each device's log is a separate file — `git merge` never produces conflicts on event logs. |
| USB / manual | Export encrypted archive, import on other device. |
| **QR sequence** | Settings → Data → Send vault via QR. The archive is chunked into TJ1 frames and displayed as a looping QR animation. Scan with the receiving device's camera — no cable, no Wi-Fi, no account. |

## Relationship to Tijori

Rotor and [Tijori](https://tijori.naklitechie.com) share the same vault engine — same event-log format, same crypto, same sync transports. They differ only in scope: Tijori stores logins, cards, notes, and codes under one master password; Rotor stores only codes.

Why both exist: TOTP is a second factor. The point of a second factor is to live on a different footing from the first. Combined storage is convenient but a breach of the master password loses both factors at once. Rotor exists for users who want the second factor to stay strictly separate — a different folder, a different master password, a different blast radius.

Format compatibility is a byproduct of engine reuse, not a feature. **Do not point both tools at the same vault folder.** Use separate folders with separate master passwords.

## Self-test

On every boot Rotor runs four RFC 6238 Appendix B test vectors (SHA-1, SHA-256, SHA-512 at T=59, plus SHA-1 at T=1111111109) against its own TOTP implementation and logs `PASS` / `FAIL` to the console. Open DevTools on first load to see `Rotor TOTP self-test: 4/4 passed`.

## Why two files

Rotor is a single HTML file in every meaningful sense — `index.html` contains all the UI, all the logic, the TOTP engine, the vault, the QR codec, everything. The one exception is `sw.js`, the service worker. It exists because browsers refuse to register a service worker from a `blob:` or `data:` URL, and a service worker is the only mechanism that lets Rotor run with the network fully disabled after the first load. `sw.js` is ~25 lines, has zero logic beyond cache-first routing, and you can read it end-to-end in thirty seconds.

## Browser support

- **Desktop** — Chrome, Edge, Firefox for the full folder-vault experience (File System Access API).
- **Mobile / iOS** — Safari 16.4+, Chrome on iOS. Vault lives in the browser's Origin Private File System instead of a user-visible folder. Export regularly to a desktop vault or via QR sync.

## License

MIT. See [`LICENSE`](LICENSE).

---

Part of the [NakliTechie](https://naklitechie.github.io/) series — single-file, browser-native, no-backend tools.
