import fs from 'node:fs';
import path from 'node:path';

export function isMigrationArchive(root, environment, relative, exists = fs.existsSync) {
  if (!['production', 'staging'].includes(environment) || typeof relative !== 'string') return false;
  const prefix = `docs/remote-migration-archive/${environment}/`;
  if (!relative.startsWith(prefix)) return false;
  const filename = relative.slice(prefix.length);
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename)) return false;
  return exists(path.join(root, relative));
}
