const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log('Starting sync...');
copyDir('E:/2026/livecap/src/components/caption', 'E:/2026/vbe/src/components/caption');
copyDir('E:/2026/livecap/src/lib/caption', 'E:/2026/vbe/src/lib/caption');
copyDir('E:/2026/livecap/src/app/api/caption', 'E:/2026/vbe/src/app/api/caption');
copyDir('E:/2026/livecap/src/app/caption', 'E:/2026/vbe/src/app/caption');

fs.copyFileSync('E:/2026/livecap/src/app/globals.css', 'E:/2026/vbe/src/app/globals.css');
if (fs.existsSync('E:/2026/livecap/local_gpu_whisper_server.py')) fs.copyFileSync('E:/2026/livecap/local_gpu_whisper_server.py', 'E:/2026/vbe/local_gpu_whisper_server.py');
if (fs.existsSync('E:/2026/livecap/run_live_caption.bat')) fs.copyFileSync('E:/2026/livecap/run_live_caption.bat', 'E:/2026/vbe/run_live_caption.bat');
if (fs.existsSync('E:/2026/livecap/run_local_gpu_server.bat')) fs.copyFileSync('E:/2026/livecap/run_local_gpu_server.bat', 'E:/2026/vbe/run_local_gpu_server.bat');
if (fs.existsSync('E:/2026/livecap/README_CAPTION.md')) fs.copyFileSync('E:/2026/livecap/README_CAPTION.md', 'E:/2026/vbe/README_CAPTION.md');
if (fs.existsSync('E:/2026/livecap/README.md')) fs.copyFileSync('E:/2026/livecap/README.md', 'E:/2026/vbe/README.md');

console.log('SYNC_FINISHED_SUCCESSFULLY');
process.exit(0);
