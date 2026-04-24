# Rotor backup file format

A Rotor backup (`.rotor`) is a UTF-8 JSON file. No binary framing, no compression.
The goal is that a technical user who has lost access to Rotor can decrypt their
own backup with OpenSSL and a text editor, and never be stranded.

A backup is a snapshot of the **live vault folder** — the same `rotor-meta.json`
plus one `rotor-events-<deviceId>.jsonl` stream per device that has ever written
to this vault. The format is append-only event logs with per-event encryption,
so a single archive can hold contributions from any number of devices.

## Top-level structure

```json
{
  "format": "rotor-archive-v1",
  "created_at": "2026-04-24T12:00:00Z",
  "meta": {
    "format": "rotor-v2",
    "kdf": {
      "algorithm": "PBKDF2",
      "hash": "SHA-256",
      "iterations": 600000,
      "salt": "<base64>"
    },
    "devices": [
      { "id": "<deviceId>", "label": "My MacBook", "registered_at": "..." }
    ]
  },
  "streams": {
    "<deviceId>": "<raw JSONL — one event per line>"
  }
}
```

- `format`: always `"rotor-archive-v1"`. Sanity check.
- `created_at`: ISO-8601 UTC timestamp of when the archive was written.
- `meta`: copy of the vault's `rotor-meta.json` — plaintext, contains KDF params and device roster.
- `streams`: map of `deviceId` → full contents of that device's event log, as a single string with newline-separated JSON events.

## Event line

Each line in a stream is a JSON object:

```json
{
  "seq": 3,
  "prev_hash": "<sha256-of-previous-raw-line-string>",
  "ts": "2026-04-24T10:22:31.000Z",
  "device_id": "<deviceId>",
  "event_type": "entry_created",
  "payload_ct": "<base64-aes-gcm-ciphertext>",
  "nonce": "<base64-12-byte-nonce>"
}
```

- `prev_hash` for the first event in a stream is the literal string `"genesis"`.
  For every other event it is the SHA-256 (base64) of the preceding raw line string.
- Tampering with any byte of any line breaks the chain — Rotor rejects streams
  with a broken chain on load.
- `event_type` is one of: `device_registered`, `device_revoked`, `entry_created`,
  `entry_updated`, `entry_deleted`.

## Cipher details

- **KDF**: PBKDF2 with SHA-256, 600,000 iterations, 16-byte salt, 32-byte output.
- **Cipher**: AES-256-GCM with a 12-byte nonce, random per event.
- **Ciphertext**: AES-GCM output with the 16-byte auth tag appended (Web Crypto convention).

## Plaintext payload (per event)

After decrypting `payload_ct` with the derived key and `nonce`, the result is UTF-8 JSON. The exact shape depends on `event_type`:

**`entry_created`** / **`entry_updated`** (TOTP code):

```json
{
  "id": "<uuid>",
  "type": "code",
  "fields": {
    "label":     { "v": "GitHub",            "ts": "2026-04-24T10:22:31Z" },
    "secret":    { "v": "JBSWY3DPEHPK3PXP",  "ts": "..." },
    "account":   { "v": "alice@example.com", "ts": "..." },
    "issuer":    { "v": "GitHub",            "ts": "..." },
    "algorithm": { "v": "SHA-1",             "ts": "..." },
    "digits":    { "v": "6",                 "ts": "..." },
    "period":    { "v": "30",                "ts": "..." }
  }
}
```

Each field carries its own timestamp so merges are per-field last-writer-wins.
`secret` is the raw TOTP shared secret in RFC 4648 base32. Feed it to any
RFC 6238 implementation (e.g. `oathtool --totp -b <secret>`) to get the same
codes Rotor generates.

**`entry_deleted`**: `{ "id": "<uuid>" }`

**`device_registered`**: `{ "device_id": "<uuid>", "label": "..." }`

**`device_revoked`**: `{ "device_id": "<uuid>" }`

## Recovery with OpenSSL

Say you've lost Rotor, have a backup file `rotor-backup.rotor`, and remember
your master password. You can recover everything from the command line:

```bash
# 1. Pick a device stream and a single event line.
jq -r '.meta.kdf.salt'                       rotor-backup.rotor > salt.b64
jq -r '.streams | to_entries[0].value'       rotor-backup.rotor > stream.jsonl

# Pick any line (here, the first entry_created event):
EVENT=$(grep '"entry_created"' stream.jsonl | head -1)
echo "$EVENT" | jq -r '.nonce'      > nonce.b64
echo "$EVENT" | jq -r '.payload_ct' > ct.b64

base64 -d < salt.b64  > salt.bin
base64 -d < nonce.b64 > nonce.bin
base64 -d < ct.b64    > cipher.bin

# 2. Derive the AES key with PBKDF2-SHA256, 600k iterations, 32-byte output.
#    (Requires OpenSSL >= 3.0 for `openssl kdf`.)
SALT_HEX=$(xxd -p -c 256 salt.bin)
KEY_HEX=$(openssl kdf -keylen 32 \
  -kdfopt digest:SHA256 \
  -kdfopt pass:"YOUR-PASSWORD-HERE" \
  -kdfopt hexsalt:"$SALT_HEX" \
  -kdfopt iter:600000 \
  -binary PBKDF2 | xxd -p -c 256)

# 3. AES-GCM decrypt. Web Crypto appends the 16-byte tag to the ciphertext.
CT_LEN=$(wc -c < cipher.bin)
PT_LEN=$((CT_LEN - 16))
head -c "$PT_LEN" cipher.bin > ct_body.bin
tail -c 16        cipher.bin > tag.bin
NONCE_HEX=$(xxd -p -c 256 nonce.bin)
TAG_HEX=$(xxd -p -c 256 tag.bin)

openssl enc -d -aes-256-gcm \
  -K "$KEY_HEX" -iv "$NONCE_HEX" \
  -in ct_body.bin -out plaintext.json \
  -tag "$TAG_HEX"

cat plaintext.json
```

You get the plaintext entry with `secret` in base32, ready for any standard
TOTP tool. Repeat for each event line to reconstruct the full vault. Rotor
is never the only copy of your keys — the decryption recipe above keeps
working forever.

## Plaintext otpauth:// export

If you want a simpler escape hatch, use **Settings → Data → Export plaintext
otpauth:// list**. That produces a plain text file with one `otpauth://totp/...`
URI per line — feedable directly into any other authenticator app, no OpenSSL
required. The trade-off is obvious: the file is unencrypted, so handle it like
you'd handle a password file (transfer over a trusted channel, delete after
import).

## Future versions

If this format ever changes, `format` will bump (`rotor-archive-v2`, etc.) and
Rotor will continue to read old versions indefinitely. There is no auto-update
story: you own the HTML file, you own the backups, and the decryption recipe
above will keep working forever.
