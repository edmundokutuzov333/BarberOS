# Isolated database restore rehearsal

## Verified scope

A full PostgreSQL custom dump of the existing isolated local Supabase database was
restored to a separate PostgreSQL 17.6 container, `barberos_restore_20261124`, using
the same image `public.ecr.aws/supabase/postgres:17.6.1.095`. Its network mode is
`none`, it exposes no host port, and it is limited to one CPU and 1 GiB. Neither
cloud database was overwritten or restored during this rehearsal.

The exact application schema manifests match: tables, columns, constraints,
indexes, functions, policies, triggers, views, enums, grants and extensions. A
separate rowset check matches all 70 tables in public/private/Auth/Vault without
printing or retaining row values in the receipt. The combined rowset receipt hash
is `966683befe690c6e6cde0bf8bba54271ade29390a05aada5f85cf65d3de13a06`.
All three local Vault records authenticate/decrypt after restoration; no secret
value is printed.

## Failures found and repaired in the procedure

- The normal postgres login cannot alter Supabase reserved roles. Restore roles
  and ownership as the disposable instance's superuser, supabase_admin, with its
  private bootstrap password passed through the process environment.
- The GraphQL proxy is an extension member omitted by pg_dump; its ACL could not
  be restored before that proxy existed. Restore the main TOC, recreate the exact
  captured proxy/extension membership, then apply its deferred ACL entry.
- A database-only dump does not contain the PGSodium root key. Without it the
  restored Vault reports invalid ciphertext. The key must travel inside the
  encrypted restore package, be installed with restrictive ownership/permissions,
  and be loaded by a database restart before decryption acceptance.
- Cleaning an already partially restored database can fail on inherited realtime
  partition constraints. In the explicitly disposable target, recreate the empty
  postgres database and restore from the reviewed TOC instead of repeatedly
  dropping individual inherited constraints.

The final complete restore exits successfully; none of these failures was ignored.

## Durable package

Encrypted package:
`/Volumes/ADATA SC740/BarberOS/backups/local-foundation-20261124.encrypted.json`.
Its decryption key is stored separately under the user's private Codex backup
folder, mode 0600. The package contains the custom dump, role definitions without
role passwords, GraphQL bootstrap and PGSodium key. AES-256-GCM authenticated
decryption was verified byte-for-byte. Plaintext package SHA-256:
`2278fd1c8e5669e0b51711c77553dcf963e4422cd6d8b7bcbdf523f9ec9c01ca`.
Receipts and before/after manifests are retained alongside the encrypted package.
No backup decryption key or database encryption key is stored in Git.

## Independent restore from the encrypted package

The committed `scripts/rehearse-local-restore.mjs` repeats the full procedure from
the encrypted archive and expected manifests without consulting the original
source database. It pins image digest
`sha256:965e2dfb5a23a0d6541b6106541e777b303656ebabd4e878746b189d550c0a66`.
A second fresh target, `barberos_restore_package_20261124`, passed exact schema,
70 rowset hashes and three Vault authentication checks. Five automated tests cover
target naming, refusal of remote Docker, ownership/digest isolation, authenticated
decryption and tampering. Existing targets require deliberate `--resume` and must
have matching package ownership labels and network isolation.

```bash
DOCKER_HOST=unix:///Users/edmundokutuzov/.colima/barberos/docker.sock \
node scripts/rehearse-local-restore.mjs \
  --archive '/Volumes/ADATA SC740/BarberOS/backups/local-foundation-20261124.encrypted.json' \
  --key /Users/edmundokutuzov/.codex/private-backups/barberos/local-foundation-20261124.key \
  --manifest '/Volumes/ADATA SC740/BarberOS/backups/local-foundation-20261124.source-manifest.json' \
  --rowsets '/Volumes/ADATA SC740/BarberOS/backups/local-foundation-20261124.rowsets.json' \
  --target barberos_restore_new_rehearsal \
  --output /tmp/barberos-restore-receipt.json
```

Use an unused target name. The script refuses cloud/remote Docker hosts, restores
only its disposable target and removes its own plaintext dump after verification.
It leaves the verified target and private diagnostic log for inspection. Stop or
remove only that explicitly named rehearsal target when no longer needed.

## Limits

This proves local restore mechanics and exposed real missing prerequisites. It
does not certify a complete production recovery, Supabase-managed authentication
configuration, Storage object bytes, external provider secrets, DNS, SMTP or Vercel.
The earlier cloud captures contain public-table data and are not promoted to a full
cloud disaster-recovery certification by this result. The restored local target
is subsequently used for isolated reconciliation-candidate testing; its current
schema may therefore differ from the immutable pre-change restore receipt.
