const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
if(process.platform!=='darwin')throw new Error('This review candidate supports macOS only.');
fs.mkdirSync('.local-checks/swift-cache',{recursive:true});
execFileSync('swiftc',['-O','-module-cache-path',path.resolve('.local-checks/swift-cache'),'scripts/native-menu.swift','-o','resources/focus-menu-helper'],{stdio:'inherit'});
