import fs from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

export function configureIsolatedStack(source, projectId, ports) {
  if (!/^[a-z0-9_]{1,64}$/.test(projectId)) throw new Error('INVALID_LOCAL_PROJECT_ID');
  if (ports.length !== 4 || new Set(ports).size !== 4 || ports.some(p=>!Number.isInteger(p)||p<1024||p>65535)) throw new Error('INVALID_LOCAL_PORTS');
  let result=source.replace(/^project_id\s*=.*$/m,`project_id = "${projectId}"`);
  if (result === source && !source.includes(`project_id = "${projectId}"`)) throw new Error('PROJECT_ID_MISSING');
  function assign(section,key,value) {
    const sectionPattern=new RegExp(`(^\\[${section}\\]\\s*\\n)([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`,'m');
    let found=false;
    result=result.replace(sectionPattern,(_,header,body)=>{
      found=true;
      const field=new RegExp(`^${key}\\s*=.*$`,'m');
      return header+(field.test(body)?body.replace(field,`${key} = ${value}`):`${key} = ${value}\n`+body);
    });
    if (!found) throw new Error('LOCAL_CONFIG_SECTION_MISSING:'+section);
  }
  assign('api','port',ports[0]);assign('db','port',ports[1]);
  assign('db','shadow_port',ports[2]);assign('studio','port',ports[3]);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectId=process.env.BARBEROS_LOCAL_PROJECT_ID;
  if (!projectId) throw new Error('BARBEROS_LOCAL_PROJECT_ID_REQUIRED');
  const servers=[];
  try {
    for(let i=0;i<4;i++) {
      const server=net.createServer();servers.push(server);
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    }
    const ports=servers.map(server=>server.address().port);
    const file='supabase/config.toml';
    const updated=configureIsolatedStack(fs.readFileSync(file,'utf8'),projectId,ports);
    fs.writeFileSync(file,updated);
    if (process.env.GITHUB_ENV) {
      fs.appendFileSync(process.env.GITHUB_ENV,
        `BARBEROS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${ports[1]}/postgres\n`);
    }
    console.log(JSON.stringify({project_id:projectId,api_port:ports[0],db_port:ports[1],shadow_port:ports[2],studio_port:ports[3]}));
  } finally {
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  }
}
