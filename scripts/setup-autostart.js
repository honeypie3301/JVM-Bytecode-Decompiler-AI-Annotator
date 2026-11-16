import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';

const projectDir = process.cwd();
const appData = process.env.APPDATA;
if (!appData && process.platform === 'win32') {
  console.error('Could not locate Windows APPDATA directory.');
  process.exit(1);
}

const startupDir =
  process.platform === 'win32'
    ? path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    : null;

try {
  console.log('Building latest production bundle...');
  execSync('npm run build', { stdio: 'inherit' });
} catch {
  console.warn('[Warning] Pre-build failed. Attempting npm install to restore binaries...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
  } catch {
    console.error('[Error] Build failed even after npm install. Please check errors above.');
  }
}

const nodePath = process.execPath;
const buildVbs = (dirExpr) => `' JadAI Background Silent Launcher
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = ${dirExpr}
WshShell.CurrentDirectory = projectDir
serverFile = projectDir & "\\dist\\server.cjs"
nodeExe = "${nodePath.replace(/\\/g, '\\\\')}"
If Not fso.FileExists(serverFile) Then
  WshShell.Run "cmd.exe /c npm run build", 0, True
End If
WshShell.Environment("Process")("NODE_ENV") = "production"
WshShell.Environment("Process")("JADAI_PORT") = "4730"
WshShell.Environment("Process")("PORT") = "4730"
If fso.FileExists(serverFile) Then
  WshShell.Run """" & nodeExe & """ --expose-gc --max-old-space-size=512 dist/server.cjs", 0, False
Else
  WshShell.Run "cmd.exe /c npx tsx server.ts", 0, False
End If
`;

const projectVbsPath = path.join(projectDir, 'start-background.vbs');
fs.writeFileSync(projectVbsPath, buildVbs('fso.GetParentFolderName(WScript.ScriptFullName)'), 'utf8');

if (startupDir && fs.existsSync(startupDir)) {
  const startupVbsPath = path.join(startupDir, 'jadai-autostart.vbs');
  fs.writeFileSync(startupVbsPath, buildVbs(`"${projectDir.replace(/\\/g, '\\\\')}"`), 'utf8');
  console.log(`[OK] Registered autostart hook in Windows Startup folder: ${startupVbsPath}`);
} else if (process.platform === 'win32') {
  console.warn('[Warning] Startup folder not found. Generated start-background.vbs in project root.');
}

if (process.platform === 'win32') {
  try {
    const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "JadAI" /t REG_SZ /d "wscript.exe \\"${projectVbsPath}\\"" /f`;
    execSync(regCmd, { stdio: 'ignore' });
    console.log('[OK] Registered Windows Registry autostart key (HKCU Run)');
  } catch {}
  console.log('[OK] Launching JadAI server silently in the background...');
  exec(`wscript.exe "${projectVbsPath}"`);
} else {
  console.log('[OK] Generated background launcher.');
}

console.log('\n======================================================');
console.log(' JadAI Windows Autostart Setup Complete!');
console.log(' - Running in background at http://localhost:4730');
console.log(' - To stop: run stop.bat or "npm run stop:background"');
console.log('======================================================\n');
