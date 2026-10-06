// Audit only the candidate's freshly built payload; never reads user profiles.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const asar=require('@electron/asar');
const args=process.argv.slice(2);
const platformArg=args.find(arg=>arg.startsWith('--platform='));
const platform=platformArg?platformArg.slice('--platform='.length):process.platform;
if(!['darwin','win32'].includes(platform))throw new Error('Audit platform must be darwin or win32.');
const archives=args.filter(arg=>!arg.startsWith('--'));
if(archives.length>1||args.some(arg=>arg.startsWith('--')&&arg!==platformArg))throw new Error('Usage: audit-bundle.cjs [archive] [--platform=darwin|win32]');
const archive=archives[0]||(platform==='win32'?'release/win-unpacked/resources/app.asar':'release/mac-arm64/Focus Buddy Candidate.app/Contents/Resources/app.asar');
// Reports use '/', while ASAR's internal lookup splits filenames by the host separator.
const listing=asar.listPackage(archive).map(p=>p.replaceAll('\\','/')).filter(p=>!asar.statFile(archive,path.normalize(p.slice(1))).files);
const forbidden=/(?:live2d|cubism|WebSDK|MotionSync|mao_pro|onnx|vad[.-]|\.wasm$|\.moc3$|\.model3\.json$|^\/evidence\/|^\/.git\/|^\/src\/|^\/scripts\/|focus-buddy\.json|pixel-widget-window\.json|focus-snore\.json)/i;
const forbiddenFiles=listing.filter(p=>forbidden.test(p));
if(forbiddenFiles.length)throw new Error('Unexpected payload files: '+forbiddenFiles.join(', '));
if(platform==='win32'&&listing.includes('/resources/focus-menu-helper'))throw new Error('macOS native helper must not be shipped in the Windows payload.');
const permittedRoots=new Set(['out','resources','licenses','node_modules','package.json','LICENSE','ARTWORK-LICENSE.md','THIRD_PARTY_NOTICES.md']);
for(const p of listing)if(!permittedRoots.has(p.split('/')[1]))throw new Error('Unexpected payload root '+p);
const modules=new Set(listing.filter(p=>p.startsWith('/node_modules/')).map(p=>p.split('/')[2]));
const allowedModules=new Set(['react','react-dom','zustand','scheduler','loose-envify','js-tokens']);
for(const name of modules)if(!allowedModules.has(name))throw new Error('Unexpected runtime dependency '+name);
for(const required of ['out/main/index.js','out/preload/index.js','out/renderer/index.html','LICENSE','ARTWORK-LICENSE.md','THIRD_PARTY_NOTICES.md','licenses/LICENSE-CC-BY-4.0.txt','licenses/LICENSE-Electron.txt','licenses/LICENSES.chromium.html','licenses/LICENSE-Galmuri.txt','licenses/LICENSE-React.txt','licenses/LICENSE-React-DOM.txt','licenses/LICENSE-Zustand.txt',platform==='darwin'?'resources/focus-menu-helper':'resources/icon.ico'])if(!listing.includes('/'+required))throw new Error('Missing '+required);
let executableArchitecture;
if(platform==='win32'){
  const exe=fs.readFileSync(path.join(path.dirname(archive),'..','Focus Buddy Candidate.exe'));
  if(exe.length<64||exe.toString('ascii',0,2)!=='MZ')throw new Error('Missing Windows PE executable.');
  const pe=exe.readUInt32LE(0x3c);
  if(pe+6>exe.length||exe.toString('ascii',pe,pe+4)!=='PE\0\0'||exe.readUInt16LE(pe+4)!==0x8664)throw new Error('Expected a Windows x64 PE executable.');
  executableArchitecture='x64';
}
const pngFiles=listing.filter(p=>/^\/out\/renderer\/cat\/.+\.png$/.test(p));
if(pngFiles.length!==17)throw new Error('Expected 17 widget/icon PNGs');
const manifest=JSON.parse(asar.extractFile(archive,path.normalize('out/renderer/cat/playback.json')));
for(const state of Object.values(manifest.states))for(const frame of state.frames){if(!listing.includes('/out/renderer/cat/'+frame.file))throw new Error('Missing frame '+frame.file);}
const inputs=[];
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,entry.name);if(entry.isSymbolicLink())throw new Error('Symlink in build input '+p);if(entry.isDirectory())walk(p);else inputs.push(p.replaceAll(path.sep,'/'));}}
walk('out');
for(const p of inputs){const packaged=asar.extractFile(archive,path.normalize(p));if(!packaged.equals(fs.readFileSync(p)))throw new Error('Stale compiled file '+p);}
for(const p of listing.filter(p=>/\.(?:js|css|html|json)$/.test(p)&&!p.startsWith('/licenses/'))){const bytes=asar.extractFile(archive,path.normalize(p.slice(1)));if(/\/Users\/|[A-Z]:[\\/]+Users[\\/]|libfile_|file_00000000|ANTHROPIC_API_KEY=|sk-ant-|ghp_[A-Za-z0-9]{20}/i.test(bytes.toString()))throw new Error('Private marker in '+p);}
const report={platform,executableArchitecture,archive:path.basename(archive),sha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),fileCount:listing.length,runtimeDependencies:[...modules].sort(),compiledFilesCompared:inputs.length,catPngCount:pngFiles.length,forbiddenFiles,notices:listing.filter(p=>p.startsWith('/licenses/')),files:listing};
fs.mkdirSync('.local-checks',{recursive:true});fs.writeFileSync(`.local-checks/bundle-audit-${platform}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({platform,executableArchitecture,sha256:report.sha256,fileCount:report.fileCount,runtimeDependencies:report.runtimeDependencies,compiledFilesCompared:report.compiledFilesCompared,forbiddenFiles:[],notices:report.notices.length}));
