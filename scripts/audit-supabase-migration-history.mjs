#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'docs', 'barberos-migration-history-snapshot-2026-10-26.json');
const strict = process.argv.includes('--strict');
const reportOnly = process.argv.includes('--report-only');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const migrationDir = path.join(root, 'supabase', 'migrations');
const localFiles = fs.readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort();
const snapshotFiles = new Set(snapshot.source_files ?? []);
const localRecords = localFiles.map(file => ({
  file,
  version: file.slice(0, 14),
  stem: file.replace(/^\d{14}_/, '').replace(/\.sql$/, ''),
}));
const byStem = new Map();
for (const local of localRecords) {
  const entries = byStem.get(local.stem) ?? [];
  entries.push(local);
  byStem.set(local.stem, entries);
}
const normalize = name => name.replace(/^\d{14}_/, '');

function mapEnvironment(environment, project) {
  const records = (project.migrations ?? []).map(record => {
    const rawName = record.name;
    const keys = [...new Set([rawName, normalize(rawName)])];
    const candidateKey = keys.find(key => byStem.has(key)) ?? null;
    return {...record, rawName, candidateKey};
  });
  const groups = new Map();
  for (const record of records) {
    if (record.candidateKey) {
      const group = groups.get(record.candidateKey) ?? [];
      group.push(record);
      groups.set(record.candidateKey, group);
    }
  }
  const resolutions = snapshot.reviewed_resolutions?.[environment] ?? {};
  const reviewedLocal = snapshot.reviewed_local_sources?.[environment] ?? {};
  const mappedFiles = new Set();
  const output = new Map();

  for (const [key, group] of groups) {
    const candidates = [...(byStem.get(key) ?? [])].sort((a,b)=>a.version.localeCompare(b.version));
    const remotes = [...group].sort((a,b)=>a.version.localeCompare(b.version));
    if (candidates.length === 1 && remotes.length === 1) {
      const remote = remotes[0];
      const source = candidates[0];
      const status = remote.version === source.version ? 'exact_version_and_name' :
        remote.rawName === key ? 'timestamp_alias_name_match' : 'embedded_timestamp_alias';
      output.set(remote.version, {...remote, status, source_file:source.file});
      mappedFiles.add(source.file);
      continue;
    }
    for (const remote of remotes) {
      const exact = candidates.find(candidate => candidate.version === remote.version);
      if (exact) {
        output.set(remote.version, {...remote,status:'exact_version_and_name',source_file:exact.file});
        mappedFiles.add(exact.file);
      } else if (candidates.length > 1 && candidates.length === remotes.length) {
        const index = remotes.findIndex(item => item.version === remote.version);
        const candidate = candidates[index];
        output.set(remote.version, {...remote,status:'ordered_duplicate_name_alias',source_file:candidate.file});
        mappedFiles.add(candidate.file);
      } else {
        output.set(remote.version, {...remote,status:'ambiguous_duplicate_name',candidates:candidates.map(candidate=>candidate.file)});
      }
    }
  }

  const validEvidence = value => value && typeof value.status === 'string'
    && value.status.trim().length > 0 && typeof value.evidence === 'string'
    && value.evidence.trim().length >= 12;
  for (const remote of records) {
    const existing = output.get(remote.version);
    if (existing && existing.status !== 'ambiguous_duplicate_name') continue;
    const override = resolutions[remote.version];
    if (validEvidence(override)) {
      if (override.source_file) {
        if (!localFiles.includes(override.source_file)) {
          output.set(remote.version,{...remote,status:'invalid_reviewed_resolution',review:override});
          continue;
        }
        mappedFiles.add(override.source_file);
      }
      output.set(remote.version,{...remote,status:'reviewed_'+override.status,source_file:override.source_file ?? null,evidence:override.evidence});
    } else if (!existing) {
      output.set(remote.version,{...remote,status:'unresolved_remote_history'});
    }
  }

  const mapped = [...output.values()];
  const unresolved = mapped.filter(x=>['unresolved_remote_history','ambiguous_duplicate_name','invalid_reviewed_resolution'].includes(x.status));
  const hasLocalReviewEvidence = value => value && typeof value.status === 'string' && value.status.trim().length > 0
    && typeof value.evidence === 'string' && value.evidence.trim().length >= 12;
  const sourceNotRepresented = snapshot.source_files.filter(file=>!mappedFiles.has(file) && !hasLocalReviewEvidence(reviewedLocal[file]));
  const newlyAddedLocalFiles = localFiles.filter(file=>!snapshotFiles.has(file));
  const counts = {};
  for (const item of mapped) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return {
    environment,
    project_ref:project.ref,
    remote_history_records:mapped.length,
    classification_counts:counts,
    unresolved_remote_records:unresolved.map(x=>({version:x.version,name:x.name,status:x.status,candidates:x.candidates})),
    source_files_not_mapped_at_snapshot:sourceNotRepresented,
    source_file_count_not_mapped:sourceNotRepresented.length,
    unresolved_source_file_count:sourceNotRepresented.length,
    new_local_migration_files_since_snapshot:newlyAddedLocalFiles,
    unresolved_count:unresolved.length
  };
}

const results = Object.entries(snapshot.projects).map(([environment, project])=>mapEnvironment(environment,project));
const unresolvedRemote = results.reduce((sum,result)=>sum+result.unresolved_count,0);
const unresolvedSources = results.reduce((sum,result)=>sum+result.unresolved_source_file_count,0);
const unresolved = unresolvedRemote + unresolvedSources;
const output = {
  audit:'BarberOS remote migration-history name mapping',
  captured_on:snapshot.captured_on,
  source_commit:snapshot.source_commit,
  current_local_migration_count:localFiles.length,
  source_file_count_in_snapshot:snapshot.source_files.length,
  mode:strict ? 'strict' : reportOnly ? 'report_only' : 'summary',
  status:unresolved ? 'NO_GO_UNRESOLVED_HISTORY_MAPPING' : 'HISTORY_NAME_MAPPING_COMPLETE',
  unresolved_remote_total:unresolvedRemote,
  unresolved_source_file_total:unresolvedSources,
  unresolved_total:unresolved,
  projects:results,
  limitations:[
    'This script maps the captured remote history names to source filenames; it does not prove SQL equivalence or compare live database objects.',
    'The snapshot is dated. Refresh it through a new read-only query before relying on it for a later release.',
    'Review overrides require a meaningful evidence note. Never delete or rewrite remote migration history to make this report green.'
  ]
};
console.log(JSON.stringify(output,null,2));
if (strict && unresolved > 0) {
  console.error('Production release blocked: unresolved remote history entries or unreviewed legacy source files require source recovery or an evidence-backed, reviewed disposition.');
  process.exitCode = 1;
}
