# Rotor

&#x26AB; **Try it now &rarr; https://rotor.naklitechie.com/**

**A TOTP authenticator in one HTML file.**

No install, no account, no sync, no binaries, no app stores, no update channel.
Opens in any browser on any device. Your secrets never leave the device.

---

## What it does

- Generates rotating 6/8-digit TOTP codes (RFC 6238) — SHA-1 and SHA-256, 30s and 60s periods
- Add accounts by pasting an `otpauth://` URI or typing the secret manually
- Tap a code to copy it
- Encrypted vault: AES-GCM with PBKDF2-SHA256 (600,000 iterations), stored in IndexedDB
- Encrypted backup/restore to a single `.rotor` file
- Backup nag banner until you've actually backed up

## What it deliberately isn't

- **No cloud sync.** Not now, not ever.
- **No account.** There is nothing to log into.
- **No recovery.** If you lose your passphrase, your accounts are gone. Back up.
- **No telemetry, no analytics, no update channel, no network requests of any kind.**
- **No framework, no build step.** It's one HTML file. Open it in a text editor, read every line.

## How it works

| Concern | Solution |
|---|---|
| TOTP | Pure Web Crypto `HMAC-SHA-1` / `HMAC-SHA-256`. ~20 lines. |
| Base32 | Hand-rolled decoder, ~15 lines. |
| Encryption | `PBKDF2(passphrase, salt, 600k, SHA-256)` → AES-256-GCM via Web Crypto. |
| Storage | Single IndexedDB record, encrypted blob. Nothing else touches disk. |
| Backup format | JSON containing the encrypted record + KDF params. Documented in [`BACKUP-FORMAT.md`](BACKUP-FORMAT.md) — decryptable with OpenSSL. |
| Dependencies | **Zero.** |
| Build step | **None.** Open `index.html`, it works. |

## Usage

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari — desktop or mobile).
2. Set a passphrase. Confirm you understand there is no recovery.
3. Add an account: paste an `otpauth://` URI from a 2FA setup page, or type the secret manually.
4. Tap the code to copy it. A countdown ring shows when it rotates.
5. **Back up your vault.** Settings → Export backup. Store the `.rotor` file somewhere safe (a cloud folder is fine — the file is encrypted).

## Phase status

**Phase 1 + Phase 2 shipped.** TOTP core, encryption, vault, manual/URI add, QR scanner (jsQR inlined, ~130 KB), `otpauth-migration://` import (hand-rolled protobuf walker, no library), and Service Worker offline caching.

Planned follow-ups (v1.1+):

- Search/filter accounts
- Auto-lock after N seconds idle
- Additional import formats
- HOTP, Steam Guard, printable paper backup (v2)

## Why there are two files

Rotor is a single HTML file in every meaningful sense — `index.html` contains all the UI, all the logic, the TOTP engine, the vault, the QR decoder, everything. The one exception is `sw.js`, the service worker. This file exists because browsers refuse to register a service worker from a `blob:` or `data:` URL, and a service worker is the only mechanism that lets Rotor actually run with the network fully disabled after the first load. `sw.js` is ~25 lines, has zero logic beyond cache-first routing, and you can read it end-to-end in thirty seconds.

## Self-test

On every boot Rotor runs four RFC 6238 test vectors against its own TOTP implementation and logs `PASS` / `FAIL` to the console. Open DevTools on first load to see it pass.

## License

MIT. See [`LICENSE`](LICENSE).

---

Part of the [NakliTechie](https://naklitechie.github.io/) series — single-file, browser-native, no-backend tools.
