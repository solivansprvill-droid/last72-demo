#!/usr/bin/env node
// 副手：调用 Numes 平台免费 GLM 模型（OpenAI 兼容）。仅用于开发期出草稿，不参与游戏构建与上传。
// 用法：node tools/numes_chat.mjs [-m z-ai/glm-5.3|z-ai/glm-5.3-flash] [-s "系统提示"] "提示词"
//       node tools/numes_chat.mjs -p openrouter -m <模型id:free> "提示词"   （OpenRouter 仅限 :free 且价格为 0 的模型）
//       node tools/numes_chat.mjs -p openrouter --list-free
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 若环境里配置了代理，Node 的 fetch 默认不走代理：自动带 NODE_USE_ENV_PROXY=1 重启自身
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const ALLOWED = ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash']; // 只允许两个免费模型
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const envFile = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) envFile[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
let provider = 'numes', model = null, system = null, maxTokens = 4096, listFree = false; const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-m') model = args[++i];
  else if (args[i] === '-p') provider = args[++i];
  else if (args[i] === '--list-free') listFree = true;
  else if (args[i] === '-s') system = args[++i];
  else if (args[i] === '--max') maxTokens = Number(args[++i]);
  else rest.push(args[i]);
}
const P = {
  numes: { url: 'https://api.numes.ai/api/v1', env: 'NUMES_API_KEY', def: 'z-ai/glm-5.3' },
  openrouter: { url: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', def: null },
}[provider];
if (!P) { console.error('provider 只能是 numes 或 openrouter'); process.exit(1); }
const key = envFile[P.env] || process.env[P.env];
if (!key) { console.error(`缺少 ${P.env}（请写入工程根目录 .env）`); process.exit(1); }
async function freeOpenRouterModels() {
  const r = await fetch(P.url + '/models', { headers: { 'User-Agent': 'curl/8.0' } });
  const d = (await r.json()).data || [];
  return d.filter(m => m.id.endsWith(':free') && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0).map(m => m.id);
}
if (provider === 'openrouter' && listFree) { console.log((await freeOpenRouterModels()).join('\n')); process.exit(0); }
model = model || P.def;
if (provider === 'numes' && !ALLOWED.includes(model)) { console.error(`只允许免费模型：${ALLOWED.join(', ')}`); process.exit(1); }
if (provider === 'openrouter') {
  if (!model) { console.error('OpenRouter 需用 -m 指定 :free 模型（--list-free 查看）'); process.exit(1); }
  const free = await freeOpenRouterModels();
  if (!free.includes(model)) { console.error(`拒绝：${model} 不是 OpenRouter 当前的免费模型`); process.exit(1); }
}
const prompt = rest.join(' ');
if (!prompt) { console.error('用法：node tools/numes_chat.mjs -m z-ai/glm-5.3 "提示词"'); process.exit(1); }

const messages = [];
if (system) messages.push({ role: 'system', content: system });
messages.push({ role: 'user', content: prompt });

const res = await fetch(P.url + '/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'User-Agent': 'curl/8.0',
  },
  body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`); process.exit(2); }
let data; try { data = JSON.parse(text); } catch { console.error('非 JSON 响应'); process.exit(3); }
const out = data?.choices?.[0]?.message?.content;
if (out == null) { console.error('响应中没有内容：' + text.slice(0, 300)); process.exit(4); }
console.log(out);
