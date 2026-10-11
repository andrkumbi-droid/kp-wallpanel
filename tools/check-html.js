// Syntax check of every inline <script> in the given HTML files. Exit code 1 on any error,
// so a deploy script can stop before a broken page goes live.
const fs=require('fs'); let bad=0;
for(const f of process.argv.slice(2)){
  const s=fs.readFileSync(f,'utf8'), re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m, i=0;
  while((m=re.exec(s))){ i++; if(/type=["'](?!text\/javascript|module)/i.test(m[0].slice(0,m[0].indexOf('>')))) continue;
    try{ new Function(m[1]); }catch(e){ bad++; console.error(f+' script '+i+': '+e.message); } }
}
if(bad){ console.error(bad+' syntax error(s) — NOT deploying'); process.exit(1); }
console.log('syntax ok');
