import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const sources=[
 ['casiez--OneEuroFilter','typescript__src__OneEuroFilter.ts','one-euro/OneEuroFilter.ts'],
 ...['features','poses','types'].map(n=>['abouchedidxcode--open-source-hands',`src__kit__${n}.ts`,`open-source-hands/${n}.ts`])
];
const manifest=[];
for(const [repository,file,dest] of sources){
 const meta=JSON.parse(await readFile(resolve(root,'research/upstream',repository,'metadata.json'),'utf8'));
 const original=await readFile(resolve(root,'research/upstream',repository,file),'utf8');
 const output=resolve(root,'game/src/vendor',dest);await mkdir(resolve(output,'..'),{recursive:true});
 await writeFile(output,`// Vendored from ${meta.url} at ${meta.sha}.\n// Original source retained below. See public/licenses for redistribution terms.\n${original}`);
 manifest.push({repo:meta.repo,commit:meta.sha,path:file.replaceAll('__','/'),destination:`src/vendor/${dest}`,sha256:createHash('sha256').update(original).digest('hex')});
}
const licenses=resolve(root,'game/public/licenses');await mkdir(licenses,{recursive:true});
for(const [repo,file,name] of [['Another-Axiom--GorillaLocomotion','LICENSE','GorillaLocomotion-MIT.txt'],['GodotVR--godot-xr-tools','LICENSE','Godot-XR-Tools-MIT.txt'],['abouchedidxcode--open-source-hands','LICENSE','Open-Source-Hands-MIT.txt']])await writeFile(resolve(licenses,name),await readFile(resolve(root,'research/upstream',repo,file)));
const euro=await readFile(resolve(root,'research/upstream/casiez--OneEuroFilter/typescript__src__OneEuroFilter.ts'),'utf8');await writeFile(resolve(licenses,'OneEuroFilter-BSD.txt'),euro.slice(0,euro.indexOf('class LowPassFilter')));
await writeFile(resolve(root,'research/PORT_MANIFEST.json'),JSON.stringify({vendored:manifest,adapted:[{repo:'Another-Axiom/GorillaLocomotion',commit:'bc42e959cf3e69178f9147d89bd3ffeab1c432c4',source:'Player.cs: inverse planted-hand correction and multi-hand averaging',destination:'src/vendor/climbing/HandAnchors.ts'},{repo:'GodotVR/godot-xr-tools',commit:'6c6189bdfcdf855052ef1aeb9f3e0ec4c7a7eb60',source:'velocity_averager_linear.gd: distance/time history; movement_climb.gd: release velocity',destination:'src/vendor/climbing/HandAnchors.ts'},{repo:'abouchedidxcode/open-source-hands',commit:'dd79fb7b3a9d2e9868e433611e6b8737dfca3936',source:'src/kit/tracker.ts: GPU-first initialization and CPU fallback lifecycle',destination:'src/tracking/inference.worker.ts'}]},null,2));
console.log('Vendored four reviewed TypeScript source files and four license notices.');
