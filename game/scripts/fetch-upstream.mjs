import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../research/upstream');
await mkdir(root,{recursive:true});
const selections={
 'Another-Axiom/GorillaLocomotion':['LICENSE','Player.cs','README.md'],
 'yeemachine/kalidokit':['LICENSE.md','src/PoseSolver/calcArms.ts','src/PoseSolver/index.ts','src/HandSolver/index.ts','src/utils/vector.ts','README.md'],
 'abouchedidxcode/open-source-hands':['LICENSE','src/kit/types.ts','src/kit/hands.ts','src/kit/oneEuro.ts','src/kit/tracker.ts','src/kit/features.ts','src/kit/poses.ts','src/kit/mediapipe.ts','src/kit/engine.ts','docs/MAKING-A-GAME.md','README.md'],
 'GodotVR/godot-xr-tools':['LICENSE','addons/godot-xr-tools/LICENSE','addons/godot-xr-tools/functions/movement_climb.gd','addons/godot-xr-tools/misc/velocity_averager.gd','addons/godot-xr-tools/misc/velocity_averager_linear.gd'],
 'casiez/OneEuroFilter':['typescript/src/OneEuroFilter.ts','javascript/OneEuroFilter.js'],
 'Forsidia/openclimber':['README.md','scripts/climbing.gd','scripts/procedural_climber.gd']
};
const repositories=Object.keys(selections);
for(const repo of repositories){
 try{
 const r=await fetch(`https://api.github.com/repos/${repo}`,{headers:{'User-Agent':'CruxMotion-local-research'}});
 if(!r.ok){console.log(repo,r.status);continue;}
 const meta=await r.json();
 const c=await fetch(`https://api.github.com/repos/${repo}/commits/${meta.default_branch}`,{headers:{'User-Agent':'CruxMotion-local-research'}});
 const commit=await c.json();
 const tree=await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`,{headers:{'User-Agent':'CruxMotion-local-research'}}).then(r=>r.json());
 const folder=resolve(root,repo.replace('/','--'));await mkdir(folder,{recursive:true});
 const record={repo,sha:commit.sha,date:commit.commit?.committer?.date,license:meta.license?.spdx_id,url:meta.html_url,description:meta.description,files:tree.tree?.filter(f=>f.type==='blob').map(f=>f.path)};
 for(const path of selections[repo]){
  const response=await fetch(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${path}`);
  if(!response.ok){console.log('SKIP',repo,path,response.status);continue;}
  const text=await response.text();
  await writeFile(resolve(folder,path.replaceAll('/','__')),text);
 }
 await writeFile(resolve(folder,'metadata.json'),JSON.stringify(record,null,2));
 console.log(JSON.stringify({...record,files:record.files?.filter(p=>/license|player.cs|climb|one.?euro|calcArms|tracker|gesture|filter|normalize|pose|body/i.test(p)).slice(0,60)}));
 }catch(e){console.log(repo,e.message)}
}
