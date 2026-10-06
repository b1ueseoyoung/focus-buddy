// Windows x64 packaging. This command never publishes artifacts or uses a VM.
const { build, Platform, Arch } = require('electron-builder');

const target = process.argv[2] || 'dir';
if (!['dir', 'nsis'].includes(target)) throw new Error('Expected dir or nsis target.');
const crossBuild = process.platform !== 'win32';
if (crossBuild && target === 'nsis') {
  throw new Error('Build the NSIS installer on Windows (bun run dist:win). On other hosts, use bun run package:win for an unpacked cross-build.');
}
if (crossBuild) {
  console.warn('Cross-build only: the Windows executable cannot run on this host. Executable icon/version resource stamping is skipped; native Windows builds include it.');
}

// Keep local candidate builds unsigned even if a signing identity exists on the host.
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
delete process.env.CSC_LINK;
delete process.env.WIN_CSC_LINK;
build({
  targets: Platform.WINDOWS.createTarget([target], Arch.x64),
  publish: 'never',
  ...(crossBuild ? { config: { win: { signAndEditExecutable: false } } } : {}),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
