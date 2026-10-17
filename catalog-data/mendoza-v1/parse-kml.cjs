const fs=require('fs');
module.exports=function parse(file){
  const s=fs.readFileSync(file,'utf8');
  return s.split('<Placemark').slice(1).map(p=>{
    const attrs={};
    for(const m of p.matchAll(/<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)) attrs[m[1].trim()]=m[2].trim();
    const name=(p.match(/<name>([^<]*)<\/name>/)||[])[1]||'';
    const c=(p.match(/<coordinates>\s*([-\d.]+),([-\d.]+)/)||[]);
    return {name,attrs,lon:c[1]?+c[1]:null,lat:c[2]?+c[2]:null};
  });
};
