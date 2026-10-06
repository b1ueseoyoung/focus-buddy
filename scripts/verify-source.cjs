const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json'),'utf8'));
const expected=new Set(manifest.files.map(item=>item.path));
const found=[];
const ignored=new Set(['node_modules','out','release','.local-checks','.git']);
function walk(folder,relative=''){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    if(!relative&&(ignored.has(entry.name)||entry.name==='SOURCE_MANIFEST.json'||entry.name==='.DS_Store'))continue;
    const name=relative?relative+'/'+entry.name:entry.name;
    if(name==='resources/focus-menu-helper')continue;
    if(entry.isSymbolicLink())throw new Error('Symlink in source archive: '+name);
    if(entry.isDirectory())walk(path.join(folder,entry.name),name);else found.push(name);
  }
}
walk(root);
for(const name of found)if(!expected.has(name))throw new Error('Unexpected source file: '+name);
for(const item of manifest.files){
  const data=fs.readFileSync(path.join(root,item.path));
  const hash=crypto.createHash('sha256').update(data).digest('hex');
  if(data.length!==item.bytes||hash!==item.sha256)throw new Error('Source mismatch: '+item.path);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!pkg.private||pkg.license!=='MIT')throw new Error('Expected MIT source license and npm-publication guard');
console.log(JSON.stringify({verifiedFiles:manifest.files.length,version:pkg.version,applicationLicense:pkg.license,private:pkg.private}));
