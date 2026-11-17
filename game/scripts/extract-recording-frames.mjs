import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run=promisify(execFile);
const folder=resolve(import.meta.dirname,"../../personal-recordings",process.argv[2]);
const output=resolve(folder,"inspection");await mkdir(output,{recursive:true});
const ffmpeg=resolve(import.meta.dirname,"../../.analysis-tools/node_modules/ffmpeg-static/ffmpeg.exe");
for(const stamp of process.argv.slice(3)){
 const seconds=Number(stamp);if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new Error("Invalid timestamp");
 const name=resolve(output,`frame-${seconds.toFixed(2)}.jpg`);
 await run(ffmpeg,["-hide_banner","-loglevel","error","-n","-ss",String(seconds),"-i",resolve(folder,"camera-gameplay.webm"),"-frames:v","1","-q:v","2",name]);
 console.log(name);
}
