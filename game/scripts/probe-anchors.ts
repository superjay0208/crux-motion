import {pilot} from './pilot';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const configs=JSON.parse(await readFile(resolve(import.meta.dirname,'../../validation/campaign-results.json'),'utf8')).results;
const results=[];
for(let i=0;i<configs.length;i++){
 const s=pilot(i,{...configs[i].config,controller:'anchors'});
 const r={name:s.route.name,state:s.state,ticks:s.tick,visited:[...s.visited],caught:s.catchCount,slips:s.events.filter(e=>e.kind==='slip').length,goal:s.route.goal,met:{flew:s.flew,crossed:s.crossed,undercling:s.undercling}};
 console.log(JSON.stringify(r));results.push(r);
}
await writeFile(resolve(import.meta.dirname,'../../validation/anchor-campaign-results.json'),JSON.stringify({kind:'Existing semantic pilot through the new hand-anchor controller; not human camera acceptance',results},null,2));
