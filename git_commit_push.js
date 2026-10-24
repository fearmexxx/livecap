const { execSync } = require('child_process');
const fs = require('fs');

try {
  if (fs.existsSync('E:/2026/livecap/.git/index.lock')) {
    fs.unlinkSync('E:/2026/livecap/.git/index.lock');
    console.log('Removed index.lock');
  }
} catch (e) {
  console.log('Error removing index.lock:', e.message);
}

try {
  console.log('Running git add...');
  execSync('git add -A', { cwd: 'E:/2026/livecap', stdio: 'inherit' });
  
  console.log('Running git commit...');
  execSync('git commit -m "fix: optimize 1080p fullhd layout with visible luxury scrollbars and collapsible preview"', { cwd: 'E:/2026/livecap', stdio: 'inherit' });

  console.log('Running git push...');
  execSync('git push origin main', { cwd: 'E:/2026/livecap', stdio: 'inherit' });

  console.log('GIT_ALL_SUCCESS');
} catch (e) {
  console.error('Git execution error:', e.message);
}
