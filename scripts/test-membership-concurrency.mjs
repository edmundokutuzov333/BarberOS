import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateMembershipTarget(name, host, config) {
  if (!/^unix:\/\/\/.+/.test(host ?? '')) throw new Error('Explicit local Unix DOCKER_HOST required');
  const labels = config?.Config?.Labels ?? {};
  const restore = /^barberos_restore_[a-z0-9_]+$/.test(name ?? '')
    && labels['barberos.restore-rehearsal'] === 'true' && config.HostConfig?.NetworkMode === 'none';
  const ci = /^supabase_db_barberos_ci_[a-z0-9_]+$/.test(name ?? '')
    && labels['com.supabase.cli.project'] === name.slice('supabase_db_'.length);
  if (!restore && !ci) throw new Error('Only an owned isolated restore or BarberOS CI database is allowed');
}

export async function testMembershipConcurrency(name, host = process.env.DOCKER_HOST) {
  if (!/^unix:\/\/\/.+/.test(host ?? '')) throw new Error('Explicit local Unix DOCKER_HOST required');
  // --host overrides a configured Docker context; a remote context cannot silently
  // redirect these fixture mutations to another Docker daemon.
  const prefix = ['--host', host];
  const dockerEnv = { ...process.env };
  delete dockerEnv.DOCKER_CONTEXT;
  delete dockerEnv.DOCKER_HOST;
  const inspected = spawnSync('docker', [...prefix, 'inspect', name], { env: dockerEnv, encoding: 'utf8' });
  if (inspected.status !== 0) throw new Error('Cannot inspect the disposable target');
  const config = JSON.parse(inspected.stdout)[0];
  validateMembershipTarget(name, host, config);
  const password = config.Config.Env.find(value => value.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
  if (!password) throw new Error('Disposable database bootstrap credential unavailable');
  const env = { ...dockerEnv, PGPASSWORD: password };
  const args = [...prefix, 'exec', '--env', 'PGPASSWORD', '-i', name, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'];
  const sql = statement => {
    const result = spawnSync('docker', args, { input: statement, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Fixture SQL failed: ' + result.stderr.slice(0, 800));
    return result.stdout.trim();
  };
  const session = statement => new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env });
    let output = ''; let error = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { error += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output, error }));
    child.stdin.end(statement);
  });
  const receipts = [];
  for (const action of ['remove', 'demote']) {
    const shop = randomUUID(), a = randomUUID(), b = randomUUID(), memberA = randomUUID(), memberB = randomUUID();
    let created = false;
    try {
      sql(`begin;
        insert into auth.users(id,email,raw_user_meta_data) values('${a}','${a}@example.invalid','{}'),('${b}','${b}@example.invalid','{}');
        insert into public.barbershops(id,slug,name,status) values('${shop}','member-race-${shop}','Membership race fixture','trial');
        insert into public.barbershop_members(id,barbershop_id,user_id,role) values('${memberA}','${shop}','${a}','owner'),('${memberB}','${shop}','${b}','owner');
        commit;`);
      created = true;
      const operation = (actor, target) => `begin;
        set local role authenticated;
        select set_config('request.jwt.claim.sub','${actor}',true);
        ${action === 'remove'
          ? `select public.remove_barbershop_member('${shop}','${target}');`
          : `select public.add_member_by_email('${shop}','${actor}@example.invalid','barber');`}
        select pg_sleep(0.3);
        commit;`;
      const settled = await Promise.allSettled([session(operation(a, memberB)), session(operation(b, memberA))]);
      if (settled.some(result => result.status === 'rejected')) throw new Error('Could not run both independent PostgreSQL sessions');
      const results = settled.map(result => result.value);
      const expectedError = action === 'remove' ? 'FORBIDDEN' : 'LAST_OWNER';
      if (results.filter(result => result.code === 0).length !== 1
        || !results.some(result => result.code !== 0 && result.error.includes(expectedError))) {
        throw new Error('Concurrent ' + action + ' did not have exactly one success and ' + expectedError);
      }
      const state = JSON.parse(sql(`select jsonb_build_object(
        'owners',(select count(*) from public.barbershop_members where barbershop_id='${shop}' and role='owner'),
        'members',(select count(*) from public.barbershop_members where barbershop_id='${shop}'),
        'audit_events',(select count(*) from public.audit_logs where barbershop_id='${shop}' and action='${action === 'remove' ? 'member_removed' : 'member_role_changed'}'));`));
      if (state.owners !== 1 || state.members !== (action === 'remove' ? 1 : 2) || state.audit_events !== 1) throw new Error('Concurrent membership invariant or audit failed');
      receipts.push({ action, independentSessions: 2, successes: 1, denial: expectedError, ...state });
    } finally {
      if (created) sql(`begin;
        delete from public.barbershops where id='${shop}';
        delete from auth.users where id in('${a}','${b}');
        commit;`);
    }
  }
  const receipt = { scope: 'Disposable local database only; no cloud mutation', target: name, receipts };
  console.log(JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  testMembershipConcurrency(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
