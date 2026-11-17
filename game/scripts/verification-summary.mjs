import {readFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const unit=await read('../../validation/unit-results.json'),web=await read('../../validation/web-results.json'),build=await read('../dist/build-info.json'),campaign=await read('../../validation/campaign-results.json');
console.log(JSON.stringify({build,tests:{success:unit.success,total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests},web:web.stats,campaign:campaign.results.map(r=>({name:r.name,controller:r.controller,ticks:r.ticks,pass:r.pass,freshReplay:r.freshReplay}))},null,2));
