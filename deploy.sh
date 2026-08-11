#!/usr/bin/env bash
# 一键重新部署网页版到 GitHub Pages（gh-pages 分支）
# 用法：更新代码后运行 ./deploy.sh
set -e
cd "$(dirname "$0")"

echo "▶ 构建单文件网页..."
npm run build

echo "▶ 准备 gh-pages 分支..."
rm -rf /tmp/gpa-deploy && mkdir -p /tmp/gpa-deploy
cp dist/index.html /tmp/gpa-deploy/index.html

if git show-ref --verify --quiet refs/heads/gh-pages; then
  git checkout gh-pages
else
  git checkout --orphan gh-pages
  git rm -rf --cached . >/dev/null 2>&1 || true
  rm -f .git/index
fi

# 清空分支内容，只保留 index.html
git rm -rf --cached . >/dev/null 2>&1 || true
rm -f .git/index
cp /tmp/gpa-deploy/index.html ./index.html
git add index.html

if ! git diff --cached --quiet; then
  git commit -m "更新网页版 $(date '+%Y-%m-%d %H:%M')"
  git push origin gh-pages --force
  echo "✅ 已部署，稍等片刻访问："
else
  echo "ℹ 无变化，无需重新部署"
fi

echo "  https://$(git config user.name 2>/dev/null || echo '<用户名>').github.io/2026.8/"
git checkout main 2>/dev/null || true
