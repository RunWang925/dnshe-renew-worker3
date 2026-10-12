/*
项目名称：dnshe-renew-worker
访问地址：workers.dev域名
功能：DNSHE域名自动续期网页面板
环境变量说明
API_KEY      必填 DNSHE API Key
API_SECRET   必填 DNSHE API Secret
PANEL_PASSWORD  可选，面板访问密码；不配置默认admin；设置为空字符串""则关闭密码免密访问

Cron定时：0 0 * /90 * *  每90天执行一次
*/
const API_HOST = "https://my.dnshe.com";
const API_VERSION = "v2";
const RENEW_BEFORE_DAYS = 180;
const DAY_SECONDS = 24 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 定时任务路径 /run 不做密码校验（Cron后台调用）
    if (url.pathname === "/run") {
      return await handleRun(env);
    }

    // ========== 网页面板，密码校验逻辑 ==========
    const panelPwd = env.PANEL_PASSWORD ?? "admin"; // 环境变量优先，无变量默认admin
    // 如果变量设置为空字符串""，代表关闭密码，免密访问
    if (panelPwd.trim() === "") {
      return new Response(pageHtml(), {
        headers: { "content-type": "text/html;charset=utf-8" },
      });
    }

    // 从url参数获取密码
    const passParam = url.searchParams.get("pwd");
    if (!passParam || passParam !== panelPwd.trim()) {
      return new Response(passwordPage(), {
        headers: { "content-type": "text/html;charset=utf-8" },
      });
    }
    // 密码正确，展示面板
    return new Response(pageHtml(), {
      headers: { "content-type": "text/html;charset=utf-8" },
    });
  },
};

// 核心续期逻辑，Cron和网页执行共用
async function handleRun(env) {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg) => {
        controller.enqueue(`data: ${JSON.stringify(msg)}\n\n`);
      };
      let renewSuccessCount = 0;
      try {
        if (!env.API_KEY || !env.API_SECRET) {
          send("❌ 缺少环境变量 API_KEY / API_SECRET");
          controller.close();
          return;
        }
        const listResp = await fetch(`${API_HOST}/api/${API_VERSION}/domain/list`, {
          method: "GET",
          headers: {
            "X-API-Key": env.API_KEY,
            "X-API-Secret": env.API_SECRET,
            "User-Agent": "DNSHE-Renew-Worker"
          }
        });
        const listJson = await listResp.json();
        if (!listJson.success) {
          send(`❌ 获取域名列表失败：${listJson.message}`);
          controller.close();
          return;
        }
        const domains = listJson.data;
        send(`✅ 一共获取到 ${domains.length} 个域名`);

        for (const item of domains) {
          const { id, domain, never_expires, expire_at } = item;
          send(`--- 处理域名：${domain} (ID:${id})`);
          if (never_expires === 1) {
            send(`✅ ${domain} 是永久域名，跳过续期`);
            await sleep(300);
            continue;
          }
          const expireTs = new Date(expire_at).getTime();
          const nowTs = Date.now();
          const remainSec = (expireTs - nowTs) / 1000;
          const remainDays = Math.floor(remainSec / DAY_SECONDS);
          send(`ℹ️ ${domain} 剩余有效期：${remainDays} 天`);

          if (remainDays > RENEW_BEFORE_DAYS) {
            send(`⏭️ ${domain} 距离到期超过${RENEW_BEFORE_DAYS}天，暂不续期`);
            await sleep(300);
            continue;
          }
          send(`🔔 ${domain} 满足续期条件，发起续期请求`);
          const renewResp = await fetch(`${API_HOST}/api/${API_VERSION}/domain/renew`, {
            method: "POST",
            headers: {
              "X-API-Key": env.API_KEY,
              "X-API-Secret": env.API_SECRET,
              "Content-Type": "application/json",
              "User-Agent": "DNSHE-Renew-Worker"
            },
            body: JSON.stringify({ id })
          });
          const renewResult = await renewResp.json();
          if (renewResult.success) {
            renewSuccessCount += 1;
            send(`🎉 ${domain} 续期成功，${renewResult.message}`);
          } else {
            send(`❌ ${domain} 续期失败：${renewResult.message}`);
          }
          await sleep(800);
        }
        send("\n✅ 全部任务执行完毕");
        send(`本次成功续期域名数量：${renewSuccessCount}`);
      } catch (err) {
        send(`💥 执行异常：${err.message}`);
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 密码输入页面
function passwordPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>访问验证</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui}
body{background:#f0f2f5;display:flex;align-items:center;justify-content:center;height:100vh}
.box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px #00000014;width:360px}
h2{margin-bottom:20px;color:#222;text-align:center}
input{width:100%;padding:12px;font-size:16px;border:1px solid #ddd;border-radius:8px;outline:none;margin-bottom:16px}
button{width:100%;padding:12px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-size:16px;cursor:pointer}
</style>
</head>
<body>
<div class="box">
  <h2>面板访问密码</h2>
  <input id="pwd" type="password" placeholder="请输入访问密码">
  <button onclick="check()">提交</button>
</div>
<script>
function check(){
  const pwd = document.getElementById('pwd').value.trim();
  if(!pwd)return;
  location.href="?pwd="+encodeURIComponent(pwd);
}
</script>
</body>
</html>`;
}

// 主面板页面
function pageHtml() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DNSHE 域名自动续期面板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui}
body{background:#f0f2f5;padding:20px}
.container{max-width:900px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px #00000014}
h1{font-size:22px;margin-bottom:16px;color:#222}
#runBtn{width:100%;padding:14px;font-size:16px;background:#2563eb;color:#fff;border:0;border-radius:8px;cursor:pointer}
#log{margin-top:16px;white-space:pre-wrap;background:#ffffff;color:#222;padding:16px;border:1px solid #e5e7eb;border-radius:8px;min-height:400px;overflow:auto;font-family:Consolas,monospace;font-size:14px}
</style>
</head>
<body>
<div class="container">
  <h1>DNSHE 域名自动续期运行面板</h1>
  <button id="runBtn">开始执行</button>
  <div id="log"></div>
</div>
<script>
const btn = document.getElementById('runBtn');
const logBox = document.getElementById('log');
btn.onclick = async () => {
  btn.disabled = true;
  logBox.textContent = "";
  const source = new EventSource("/run");
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    logBox.textContent += msg + "\\n";
    logBox.scrollTop = logBox.scrollHeight;
  };
  source.onerror = () => {
    source.close();
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;
}
