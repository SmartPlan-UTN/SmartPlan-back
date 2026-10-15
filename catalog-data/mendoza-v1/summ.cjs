const t=require("fs").readFileSync(process.argv[2],"utf8");
const start=t.indexOf("\n{\n")+1;
const j=JSON.parse(t.slice(start,t.lastIndexOf("}")+1));
console.log(j.stats);
const notes={};for(const r of j.records)for(const n of r.notes||[]){const k=n.split(":")[0];notes[k]=(notes[k]||0)+1}
console.log(notes);
console.log(j.records.filter(r=>/review|rejected/.test(r.status)).slice(0,15).map(r=>JSON.stringify(r)).join("\n"));
