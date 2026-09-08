# TencentSliderSolver_cloud

腾讯滑块验证码求解 HTTP 服务,基于 FastAPI + Node.js,返回 `ticket` / `randstr`。

## 快速启动

### 本地运行

```bash
pip install -r requirements.txt
python app/main.py          # 默认监听 0.0.0.0:8000,可用环境变量 PORT 覆盖
```

### Docker 运行

```bash
docker build -t slider-solver .
docker run -p 7860:7860 slider-solver
```

## 接口调用方式

### GET `/solve`

过滑块验证,获取 `ticket` + `randstr`。

**请求参数(Query):**

| 参数           | 类型   | 必填 | 默认值       | 说明                         |
| -------------- | ------ | ---- | ------------ | ---------------------------- |
| `captcha_a_id` | string | 是   | `1600000770` | 验证码 AppId(必须为纯数字)   |
| `ua`           | string | 否   | 内置默认 UA  | 自定义 User-Agent(移动端 UA) |
| `tkid`         | string | 否   | `655189169`  | TK ID(渠道/子业务标识)       |
| `retry`        | int    | 否   | `3`          | 重试次数,取值 1~5            |

**成功响应 `code=0`:**

```json
{
  "code": 0,
  "ticket": "t03AE5YjP4MxX...",
  "randstr": "@rVN"
}
```

**失败响应 `code=-1`:**

```json
{
  "code": -1,
  "message": "全部重试失败"
}
```

**错误响应(HTTP 400):** 参数校验失败,如 `captcha_a_id` 非数字、`retry` 不在 1~5 范围内。

### GET `/health`

健康检查。

```json
{ "status": "ok" }
```

## 调用示例

### curl

```bash
# 使用默认参数
curl "http://localhost:8000/solve"

# 完整参数
curl "http://localhost:8000/solve?captcha_a_id=1600000770&retry=3&tkid=655189169&ua=Mozilla/5.0"
```

### Python

```python
import requests

resp = requests.get("http://localhost:8000/solve", params={
    "captcha_a_id": "1600000770",
    "retry": 3,
}, timeout=120)

if resp.json()["code"] == 0:
    data = resp.json()
    print(data["ticket"], data["randstr"])
else:
    print("验证失败:", resp.json())
```

### JavaScript

```javascript
const resp = await fetch("http://localhost:8000/solve?captcha_a_id=1600000770&retry=3");
const { code, ticket, randstr, message } = await resp.json();
if (code === 0) {
  console.log(ticket, randstr);
} else {
  console.error("验证失败:", message);
}
```

## 使用 ticket / randstr

拿到 `ticket` 和 `randstr` 后,将二者提交到业务侧需要二次校验的接口(如登录、风控接口)即可完成验证。
