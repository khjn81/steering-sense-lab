import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
export async function verifyAssets({root=defaultRoot,assets}={}) {
  const entries=assets||JSON.parse(await readFile(join(root,'quality/assets.json'),'utf8')).assets;
  let bytes=0;
  for(const entry of entries){
    const target=resolve(root,entry.path);if(!target.startsWith(resolve(root)+sep))throw new Error(`Asset path outside project: ${entry.path}`);
    const data=await readFile(target);const digest=createHash('sha256').update(data).digest('hex');
    if(data.length!==entry.bytes||digest!==entry.sha256)throw new Error(`Asset integrity mismatch: ${entry.path}`);
    bytes+=data.length;
  }
  return {files:entries.length,bytes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await verifyAssets()));}catch(error){console.error(error.message);process.exitCode=1;}
}
