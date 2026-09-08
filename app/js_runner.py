# -*- coding: utf-8 -*-
"""quickjs 运行器:进程内执行 tdc.js 生成 collect(替代 node 子进程)
流程: eval(jsenv.js) 环境自举 -> eval(collect_gen.js) 定义 runTdc
      -> eval runTdc(tdcSource, x, y) -> JSON 字符串 -> dict
"""
import json
import logging
import os
import threading

import quickjs

_DIR = os.path.dirname(os.path.abspath(__file__))
log = logging.getLogger('jsrun').info


def _load(name):
    with open(os.path.join(_DIR, name), encoding='utf-8') as f:
        return f.read()


_ENV_JS = _load('jsenv.js')
_GEN_JS = _load('collect_gen.js')
# quickjs Context 非线程安全,串行化(FastAPI 同步端点跑线程池)
_LOCK = threading.Lock()


def gen_collect(tdc_source, target_x, target_y):
    """执行 tdc.js + 注入拟人轨迹,返回 dict{collect, tlg, eks, tokenid, ans, elapsed_ms}"""
    with _LOCK:
        ctx = quickjs.Context()
        ctx.eval(_ENV_JS)
        ctx.eval(_GEN_JS)
        ctx.set('__tdcSource', tdc_source)
        out = ctx.eval('runTdc(__tdcSource, %d, %d)' % (int(target_x), int(target_y)))
    d = json.loads(out)
    if d.get('error'):
        raise RuntimeError(d['error'])
    log(f"quickjs: collect {d['tlg']} 字符, eks {len(d['eks'])}, 耗时 {d['elapsed_ms']}ms")
    return d
