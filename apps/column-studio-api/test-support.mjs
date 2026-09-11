import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
export async function loadWorker() {
  const dir=await mkdtemp(join(tmpdir(),'column-security-test-'));
  const file=join(dir,'worker.cjs');
  await build({entryPoints:[resolve('apps/column-studio-api/src/worker.js')],bundle:true,platform:'node',format:'cjs',outfile:file});
  const worker=createRequire(import.meta.url)(file).default;
  await rm(dir,{recursive:true,force:true});
  return worker;
}
