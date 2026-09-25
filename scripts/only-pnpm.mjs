// 拦截 npm / yarn 安装，保证只生成 pnpm-lock.yaml 一份锁文件。
// 由 package.json 的 preinstall 钩子调用。
const execPath = process.env.npm_execpath ?? '';
const userAgent = process.env.npm_config_user_agent ?? '';

// 无法判定来源时（例如直接 node 运行）不拦截，避免误伤。
const isKnownRunner = execPath !== '' || userAgent !== '';
const isPnpm = execPath.includes('pnpm') || userAgent.startsWith('pnpm');

if (isKnownRunner && !isPnpm) {
  console.error(
    '\n本项目使用 pnpm 管理依赖，请改用：\n\n  corepack enable\n  pnpm install\n',
  );
  process.exit(1);
}
