@echo off
cd /d E:\2026\livecap
git add -A
git commit -m "fix(ui): optimize 1080p fullhd layout, add visible luxury scrollbars and sync vbe"
git push origin main
echo GIT_PUSH_SUCCESS
