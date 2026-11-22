// Builds dist/OoTMM-Checklist-Setup.exe from the official Electron Windows zip and NSIS.
// Works on Linux, macOS or Windows. Needs: unzip, and the packaging tools in .cache/pack
// (see README.md, or let it download Electron from GitHub the first time).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = '45.2.1';
const pack = path.join(ROOT, '.cache/pack');
mkdirSync(pack, { recursive: true });
const zip = path.join(pack, `electron-v${ELECTRON}-win32-x64.zip`);
if (!existsSync(zip)) execFileSync('curl', ['-fsSL', '-o', zip, `https://github.com/electron/electron/releases/download/v${ELECTRON}/electron-v${ELECTRON}-win32-x64.zip`], { stdio: 'inherit' });

const work = path.join(pack, 'win');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', work]);

/* Same app files as dist/desktop, placed where Electron looks for them */
renameSync(path.join(work, 'electron.exe'), path.join(work, 'OoTMM Checklist.exe'));
rmSync(path.join(work, 'resources/default_app.asar'), { force: true });
cpSync(path.join(ROOT, 'dist/desktop'), path.join(work, 'resources/app'), { recursive: true });
for (const f of readdirSync(path.join(work, 'locales'))) if (f !== 'en-US.pak') rmSync(path.join(work, 'locales', f));

/* koffi (MIT), which the memory reader (desktop/memreader.js) uses to read the emulator's memory. Only its Windows x64
   part is kept. The download is checked against npm's published hash. */
const KOFFI = '2.16.4', KOFFI_SHA512 = 'EE31wJCADvsUntlzrbWvSh9Eii6hRJRWYSREWqWnKT+f3j0PWt7cFp7Gzb6FKtEk/yBIJu/HxfzfDl+FcDp1Sg==';
const ktgz = path.join(pack, `koffi-${KOFFI}.tgz`);
if (!existsSync(ktgz)) execFileSync('curl', ['-fsSL', '-o', ktgz, `https://registry.npmjs.org/koffi/-/koffi-${KOFFI}.tgz`], { stdio: 'inherit' });
if (createHash('sha512').update(readFileSync(ktgz)).digest('base64') !== KOFFI_SHA512) throw new Error('koffi download does not match its published hash');
const kx = path.join(pack, 'koffi');
rmSync(kx, { recursive: true, force: true });
mkdirSync(kx, { recursive: true });
execFileSync('tar', ['-xzf', ktgz, '-C', kx]);
const kdest = path.join(work, 'resources/app/node_modules/koffi');
for (const f of ['package.json', 'index.js', 'LICENSE.txt', 'build/koffi/win32_x64/koffi.node']) {
  mkdirSync(path.dirname(path.join(kdest, f)), { recursive: true });
  copyFileSync(path.join(kx, 'package', f), path.join(kdest, f));
}
copyFileSync(path.join(ROOT, 'icons/app.ico'), path.join(work, 'app.ico'));

const nsi = path.join(pack, 'installer.nsi');
const out = path.join(ROOT, 'dist/OoTMM-Checklist-Setup.exe');
writeFileSync(nsi, `Unicode true
!include "MUI2.nsh"
!define APP "OoTMM Checklist"
!define EXE "OoTMM Checklist.exe"
!define UNINST "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OoTMMChecklist"
Name "\${APP}"
OutFile "${out}"
InstallDir "$LOCALAPPDATA\\Programs\\\${APP}"
InstallDirRegKey HKCU "\${UNINST}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "\${APP}"
!define MUI_ICON "${path.join(ROOT, 'icons/app.ico')}"
!define MUI_UNICON "${path.join(ROOT, 'icons/app.ico')}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\\\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open OoTMM Checklist"
!define MUI_WELCOMEPAGE_TEXT "This installs OoTMM Checklist for your Windows account. It adds a Desktop shortcut and a Start menu entry, and doesn't need administrator rights."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${work}/*"
  CreateShortcut "$DESKTOP\\\${APP}.lnk" "$INSTDIR\\\${EXE}" "" "$INSTDIR\\app.ico"
  CreateShortcut "$SMPROGRAMS\\\${APP}.lnk" "$INSTDIR\\\${EXE}" "" "$INSTDIR\\app.ico"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "\${UNINST}" "DisplayName" "\${APP}"
  WriteRegStr HKCU "\${UNINST}" "DisplayIcon" "$INSTDIR\\app.ico"
  WriteRegStr HKCU "\${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${UNINST}" "UninstallString" "$\\"$INSTDIR\\Uninstall.exe$\\""
  WriteRegDWORD HKCU "\${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "\${UNINST}" "NoRepair" 1
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\\\${APP}.lnk"
  Delete "$SMPROGRAMS\\\${APP}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "\${UNINST}"
SectionEnd
`);

const nsisHome = process.env.NSIS_HOME ?? path.join(pack, 'nsis/nsis-bundle/windows');
const makensis = process.env.MAKENSIS ?? path.join(pack, 'nsis/nsis-bundle/linux/x64/makensis');
/* The bundled copy can lose its run bit when unpacked. A system makensis (MAKENSIS set) is already runnable and may not be ours to change. */
if (!process.env.MAKENSIS) chmodSync(makensis, 0o755);
execFileSync(makensis, ['-V2', nsi], { stdio: 'inherit', env: { ...process.env, NSISDIR: nsisHome } });
console.log(`Installer: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
