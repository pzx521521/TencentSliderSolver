# TCaptcha Solver Docker 服务

腾讯滑块验证码 HTTP 接口。传 `captcha_a_id`,返回 `ticket + randstr`。
内部为纯本地实现(Node 沙箱跑 tdc.js 生成 collect + OpenCV 识别缺口 + 本地 pow),无第三方依赖。

## 部署

```bash
cd cloud
docker compose up -d --build
```

如容器内需走代理访问腾讯(国内服务器通常直连即可):

```yaml
# docker-compose.yml 取消注释
environment:
  - PROXY=http://host.docker.internal:7897
```

## 接口

### GET /solve

| 参数 | 必填 | 说明 |
|---|---|---|
| captcha_a_id | 否 | 验证码 AppId,默认 `1600000770`(起点) |
| ua | 否 | 自定义 UA,默认内置起点 WebView UA |
| tkid | 否 | 渠道 TK ID,默认 `655189169` |
| retry | 否 | 整轮重试次数,1~5,默认 3 |

```bash
curl "http://localhost:8000/solve?captcha_a_id=1600000770"
```

成功:

```json
{"code": 0, "ticket": "tr03xxxx...*", "randstr": "@EaP"}
```

失败(仍为 200,按 code 区分):

```json
{"code": -1, "message": "全部重试失败"}
```

### GET /health

```json
{"status": "ok"}
```

## 与起点 finishWatch 对接

```python
# 1. risk/check 拿 sessionKey(起点侧签名,不在本服务范围)
# 2. 本服务拿票
r = requests.get('http://localhost:8000/solve', params={'captcha_a_id': captcha_aid}).json()
# 3. 提交
requests.post('https://h5.if.qidian.com/argus/api/v1/video/adv/finishWatch', data={
    'taskId': task_id,
    'sessionKey': session_key,
    'banId': 2,
    'captchaTicket': r['ticket'],
    'captchaRandStr': r['randstr'],
    'challenge': '', 'validate': '', 'seccode': '',
})
```

## 运维

```bash
docker compose logs -f          # 看日志
docker compose restart          # 重启
docker compose up -d --build    # 更新代码后重建
```

单次求解约 2~4 秒;公开无鉴权,请勿暴露在公网任人盗刷。
