import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(await readFile(resolve(root,'research/PORT_MANIFEST.json'),'utf8'));
for(const entry of manifest.vendored){
 const text=await readFile(resolve(root,'game',entry.destination),'utf8');
 const original=text.slice(text.indexOf('\n',text.indexOf('\n')+1)+1);
 if(createHash('sha256').update(original).digest('hex')!==entry.sha256)throw new Error('Vendored source changed: '+entry.destination);
}
const build=JSON.parse(await readFile(resolve(root,'game/dist/build-info.json'),'utf8'));
const report=await readFile(resolve(root,'validation/REPORT.md'),'utf8');
if(!report.includes(build.sourceHash)||!report.includes(build.builtAt))throw new Error('Report build does not match');
console.log(JSON.stringify({unmodifiedVendoredFiles:manifest.vendored.length,adaptedOperations:manifest.adapted.length,reportMatchesBuild:true}));
