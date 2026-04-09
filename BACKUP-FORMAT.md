# Rotor backup file format

A Rotor backup (`.rotor`) is a UTF-8 JSON file. No binary framing, no compression.
The goal is that a technical user who has lost access to Rotor can decrypt their
own backup with OpenSSL and a text editor, and never be stranded.

## Top-level structure

```json
{
  "magic": "ROTOR-BACKUP",
  "version": 1,
  "created_at": "2026-04-09T12:00:00Z",
  "vault": {
    "version": 1,
    "kdf": {
      "algorithm": "PBKDF2",
      "hash": "SHA-256",
      "iterations": 600000,
      "salt": "<base64>"
    },
    "cipher": {
      "algorithm": "AES-GCM",
      "iv": "<base64>",
      "ciphertext": "<base64>"
    }
  }
}
```

- `magic`: always the literal string `"ROTOR-BACKUP"`. Sanity check.
- `version`: backup format version. Currently `1`.
- `created_at`: ISO-8601 UTC timestamp of when the backup was written.
- `vault`: the encrypted vault record (also the same shape used in IndexedDB).

## Cipher details

- **KDF**: PBKDF2 with SHA-256, 600,000 iterations, 16-byte salt, 32-byte output.
- **Cipher**: AES-256-GCM with a 12-byte IV.
- **Ciphertext**: AES-GCM ciphertext with the 16-byte auth tag appended (Web Crypto convention).

## Plaintext payload

After decrypting `cipher.ciphertext`, the result is UTF-8 JSON:

```json
{
  "version": 1,
  "accounts": [
    {
      "id": "<uuid>",
      "issuer": "GitHub",
      "label": "alice@example.com",
      "secret": "JBSWY3DPEHPK3PXP",
      "period": 30,
      "digits": 6,
      "algorithm": "SHA-1",
      "order": 0,
      "added_at": "2026-04-09T12:00:00Z"
    }
  ],
  "settings": {
    "last_backup_at": "2026-04-09T12:00:00Z"
  }
}
```

`secret` is the raw TOTP shared secret in RFC 4648 base32. Feed it to any
RFC 6238 implementation (for instance, `oathtool --totp -b <secret>`) to get
the same codes Rotor generates.

## Recovery with OpenSSL

Say you've lost Rotor, have the backup file `rotor-backup.rotor`, and
remember your passphrase. You can recover the plaintext entirely from the
command line:

```bash
# 1. Extract the fields from the JSON into shell variables.
SALT_B64=$(jq -r '.vault.kdf.salt' rotor-backup.rotor)
IV_B64=$(jq -r '.vault.cipher.iv' rotor-backup.rotor)
CT_B64=$(jq -r '.vault.cipher.ciphertext' rotor-backup.rotor)

# 2. Decode salt/iv/ciphertext into raw bytes.
echo "$SALT_B64" | base64 -d > salt.bin
echo "$IV_B64"   | base64 -d > iv.bin
echo "$CT_B64"   | base64 -d > cipher.bin

# 3. Derive the AES key with PBKDF2-SHA256, 600k iterations, 32-byte output.
#    (Requires OpenSSL >= 3.0 for `openssl kdf`.)
SALT_HEX=$(xxd -p -c 256 salt.bin)
KEY_HEX=$(openssl kdf -keylen 32 \
  -kdfopt digest:SHA256 \
  -kdfopt pass:"YOUR-PASSPHRASE-HERE" \
  -kdfopt hexsalt:"$SALT_HEX" \
  -kdfopt iter:600000 \
  -binary PBKDF2 | xxd -p -c 256)

# 4. AES-GCM decrypt. Note: Web Crypto appends the 16-byte tag to the ciphertext,
#    so the last 16 bytes of cipher.bin are the tag.
CT_LEN=$(wc -c < cipher.bin)
PT_LEN=$((CT_LEN - 16))
head -c "$PT_LEN" cipher.bin > ct_body.bin
tail -c 16       cipher.bin > tag.bin
IV_HEX=$(xxd -p -c 256 iv.bin)
TAG_HEX=$(xxd -p -c 256 tag.bin)

openssl enc -d -aes-256-gcm \
  -K "$KEY_HEX" \
  -iv "$IV_HEX" \
  -in ct_body.bin \
  -out plaintext.json \
  -tag "$TAG_HEX"

cat plaintext.json
```

You will get your plaintext JSON payload, with `secret` fields in base32 ready
to feed to any standard TOTP tool. Rotor is never the only copy of your keys —
you always have an escape hatch.

## Future versions

If this format ever changes, `version` will bump and Rotor will continue to
read old versions indefinitely. There is no auto-update story: you own the
HTML file, you own the backups, and the decryption recipe above will keep
working forever.
