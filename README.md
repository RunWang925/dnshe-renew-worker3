# DNSHE Renew Worker
DNSHE免费域名自动续期，基于 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/RunWang925/dnshe-renew-worker)

## 简介
自动遍历DNSHE账号下所有域名，到期前180天内自动提交免费续期；永久域名`never_expires=1`自动跳过。

## 部署步骤
1. 点击上方蓝色按钮一键部署到 Cloudflare Workers
2. 部署完成后，进入 Worker【设置】→【环境变量】，添加2个变量：
- `API_KEY`：DNSHE API Key
- `API_SECRET`：DNSHE API Secret
3. 【可选】添加 Cron 定时触发器，**每90天自动执行**
> Cron表达式：`0 0 */90 * *`

## 工作逻辑
1. 调用DNSHE V2 API拉取全部域名列表
2. 遍历域名：
   - `never_expires=1` → 永久域名，跳过
   - 普通域名，计算距离到期剩余天数
3. 触发条件：剩余天数 ≤ 180天，则发起续期
   - DNSHE官方限制：仅到期前180天内允许免费续期
   - 续期成功：到期时间直接 +365天
   - 续期失败：下一轮Cron巡检自动重试一次兜底

## 说明
- 单次Cron执行，正常场景只会续一次；故障场景提供1次重试冗余
- 建议定期打开面板查看运行日志，防止两轮全部执行失败导致域名过期
