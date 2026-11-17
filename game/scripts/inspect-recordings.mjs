import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"../../personal-recordings");
for(const name of await readdir(root)){
 const folder=resolve(root,name);
 if(!(await stat(folder)).isDirectory())continue;
 let d;try{d=JSON.parse(await readFile(resolve(folder,"telemetry.json"),"utf8"));}catch{continue;}
 if(process.argv[2]==="features"){
   if(!name.includes("07-31-21"))continue;
   for(const t of [5.1,11.1,16.1,18.6,22.5,25.3,28.7,32.9,33.8]){
     const f=d.frames.reduce((a,b)=>Math.abs(a.time-t)<Math.abs(b.time-t)?a:b);
     console.log(JSON.stringify({time:f.time,hands:Object.fromEntries(Object.entries(f.hands).map(([s,h])=>[s,{grip:h.grip,features:h.features}]))}));
   }
   continue;
 }
 console.log(JSON.stringify({session:name,meta:{createdAt:d.createdAt,stopReason:d.stopReason,calibration:d.calibration,baselineFps:d.baselineFps,video:d.video},summary:d.analysis}));
 const events=d.frames.flatMap(f=>f.events.map(e=>({time:f.time,route:f.route,...e,grips:[f.hands.left.grip,f.hands.right.grip],reach:[f.hands.left.reach,f.hands.right.reach],hands:[f.hands.left.hand,f.hands.right.hand]})));
 console.log("EVENTS",JSON.stringify(events));
 const transitions=[];let prev="";
 for(const f of d.frames){const key=[f.state,f.pauseReason,f.hands.left.grip,f.hands.right.grip,f.hands.left.contact,f.hands.right.contact].join("|");if(key!==prev){transitions.push({time:+f.time.toFixed(2),state:f.state,pause:f.pauseReason,grips:[f.hands.left.grip,f.hands.right.grip],contacts:[f.hands.left.contact,f.hands.right.contact],reach:[f.hands.left.reach,f.hands.right.reach],raw:[f.hands.left.rawExtension,f.hands.right.rawExtension]});prev=key;}}
 console.log("TRANSITIONS",JSON.stringify(transitions));
}
