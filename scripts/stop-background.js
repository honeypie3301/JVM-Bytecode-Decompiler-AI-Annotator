import { execSync } from 'child_process';

const port = Number(process.env.JADAI_PORT || 4730);
console.log(`Stopping background JadAI server on port ${port}...`);
if (process.platform === 'win32') {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = output.split('\n').filter(Boolean);
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`);
        console.log(`[OK] Terminated JadAI process on PID ${pid}`);
      } catch {}
    }
  } catch {
    console.log(`[Notice] No active process was found listening on port ${port}.`);
  }
} else {
  try {
    execSync(`fuser -k ${port}/tcp`);
    console.log(`[OK] Terminated process on port ${port}`);
  } catch {}
}
console.log('JadAI background server stopped.');
