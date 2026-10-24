const { execSync } = require('child_process');
const fs = require('fs');

try {
  if (fs.existsSync('E:/2026/livecap/.git/index.lock')) {
    fs.unlinkSync('E:/2026/livecap/.git/index.lock');
  }
} catch (e) {}

try {
  console.log('Staging changes...');
  execSync('git add -A', { cwd: 'E:/2026/livecap', stdio: 'inherit' });
  
  console.log('Committing changes...');
  execSync('git commit -m "feat: split standalone live captioning app, remove corporate website code"', { cwd: 'E:/2026/livecap', stdio: 'inherit' });

  console.log('Pushing to GitHub...');
  execSync('git push origin main', { cwd: 'E:/2026/livecap', stdio: 'inherit' });

  console.log('STANDALONE_PUSH_SUCCESS');
} catch (e) {
  console.error('Git error:', e.message);
} finally {
  try {
    fs.unlinkSync(__filename);
  } catch (e) {}
}
