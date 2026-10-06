const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const target=process.argv[2]||process.platform;
if(target==='win32'){
  console.log('Windows target: Swift/AppKit menu helper is not built.');
  process.exit(0);
}
if(target!=='darwin')throw new Error('Supported build platforms are darwin and win32.');
if(process.platform!=='darwin')throw new Error('The macOS menu helper must be compiled on macOS.');
fs.mkdirSync('.local-checks/swift-cache',{recursive:true});
execFileSync('swiftc',['-O','-module-cache-path',path.resolve('.local-checks/swift-cache'),'scripts/native-menu.swift','-o','resources/focus-menu-helper'],{stdio:'inherit'});
