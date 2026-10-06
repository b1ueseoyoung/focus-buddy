const {execFileSync}=require('node:child_process');
const path=require('node:path');
exports.default=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const bundle=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
  execFileSync('codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});
};
