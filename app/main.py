# -*- coding: utf-8 -*-
"""腾讯滑块验证 HTTP 服务
GET /solve?captcha_a_id=1600000770[&ua=...][&tkid=...][&retry=3]
GET /health
"""
import logging
import os
import sys

from fastapi import FastAPI, HTTPException
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import solver  # noqa: E402

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('api')

app = FastAPI(title='TCaptcha Solver', docs_url=None, redoc_url=None)


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.get('/solve')
def solve(captcha_a_id: str = '1600000770', ua: str = '', tkid: str = '',
          retry: int = 3):
    """过滑块验证,返回 ticket + randstr"""
    if not captcha_a_id.isdigit():
        raise HTTPException(status_code=400, detail='captcha_a_id 必须为数字')
    if not 1 <= retry <= 5:
        raise HTTPException(status_code=400, detail='retry 取值 1~5')
    _ua = ua.strip() or solver.DEFAULT_UA
    if tkid.strip():
        solver.TKID = tkid.strip()
    log.info(f'/solve aid={captcha_a_id} retry={retry} ua_len={len(_ua)}')
    r = solver.get_ticket(captcha_a_id=captcha_a_id, ua=_ua, retry=retry)
    log.info(f'/solve result code={r["code"]}')
    return r


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 8000)))
