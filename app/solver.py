# -*- coding: utf-8 -*-
"""
腾讯 TCaptcha 滑块验证(Docker 服务版核心逻辑)
流程: prehandle -> 下载图/tdc.js -> CV识别缺口 -> Node沙箱注入轨迹生成collect
      -> 本地pow -> cap_union_new_verify -> ticket/randstr
环境变量: PROXY=http://host:port 可选,设置后所有腾讯请求走该代理
"""
import base64
import hashlib
import json
import logging
import os
import random
import re
import subprocess
import sys
import time

import cv2
import numpy as np
import requests

WORK = os.path.dirname(os.path.abspath(__file__))
AID = "1600000770" # 1600000770 是起点风控下发的 CaptchaAId(验证码 AppId) 
TKID = "655189169" # 655189169 是起点业务自己的 TK ID(渠道/子业务标识) 应该不传也可以
ENTRY_URL = "https://h5.if.qidian.com/new/welfareCenter/"

DEFAULT_UA = ('Mozilla/5.0 (Linux; Android 14; 2106118C Build/UKQ1.231207.002; wv) '
              'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 '
              'MQQBrowser/6.2 TBS/047823 Mobile Safari/537.36 QDJSSDK/1.0  QDNightStyle_1  '
              'QDReaderAndroid/7.9.420/1656/1002138/Xiaomi/QDShowNativeLoading')

_proxy = os.environ.get('PROXY', '').strip()
PROXIES = {'http': _proxy, 'https': _proxy} if _proxy else {}


log = logging.getLogger('solver').info


def make_session(ua):
    s = requests.Session()
    s.headers.update({
        'User-Agent': ua,
        'Referer': 'https://turing.captcha.qcloud.com/template/drag_ele.html',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    s.proxies.update(PROXIES)
    return s


def prehandle(s, ua, captcha_a_id=AID):
    params = {
        "aid": str(captcha_a_id), "protocol": "https", "accver": "1", "showtype": "popup",
        "ua": base64.b64encode(ua.encode()).decode(),
        "noheader": "0", "fb": "1", "aged": "0", "enableAged": "0",
        "enableDarkMode": "0", "grayscale": "1", "clientype": "1", "cap_cd": "",
        "uid": "", "lang": "zh-cn", "entry_url": ENTRY_URL, "elder_captcha": "0",
        "js": "/tcaptcha-frame.48785b62.js", "login_appid": "", "wb": "1",
        "tkid": TKID, "subsid": "5", "callback": "_aq_%d" % random.randint(100000, 999999),
        "sess": "",
    }
    r = s.get('https://turing.captcha.qcloud.com/cap_union_prehandle', params=params, timeout=20)
    r.raise_for_status()
    d = json.loads(r.text.split('(')[1].rsplit(')', 1)[0])
    if d.get('state') != 1:
        raise RuntimeError(f'prehandle 失败: {d}')
    return d


def download_assets(s, data):
    base = 'https://turing.captcha.qcloud.com'
    dyn = data['dyn_show_info']
    comm = data['comm_captcha_cfg']

    sess_dir = os.path.join(WORK, 'sessions', time.strftime('%H%M%S') + f'_{random.randint(100, 999)}')
    os.makedirs(sess_dir, exist_ok=True)

    paths = {}
    r = s.get(base + comm['tdc_path'], timeout=20); r.raise_for_status()
    paths['tdc'] = os.path.join(sess_dir, 'tdc.js')
    open(paths['tdc'], 'wb').write(r.content)

    r = s.get(base + dyn['bg_elem_cfg']['img_url'], timeout=20); r.raise_for_status()
    paths['bg'] = os.path.join(sess_dir, 'bg.jpg')
    open(paths['bg'], 'wb').write(r.content)

    r = s.get(base + dyn['sprite_url'], timeout=20); r.raise_for_status()
    paths['sprite'] = os.path.join(sess_dir, 'sprite.png')
    open(paths['sprite'], 'wb').write(r.content)
    paths['dir'] = sess_dir
    return paths


def find_gap(bg_path, sprite_path, fg_elem):
    """识别缺口:粗定位(暗度/边缘融合)+ 白描边精修(top-hat × alpha 轮廓)"""
    bg = cv2.imread(bg_path)
    sprite = cv2.imread(sprite_path, cv2.IMREAD_UNCHANGED)
    x, y = fg_elem['sprite_pos']
    w, h = fg_elem['size_2d']
    piece = sprite[y:y + h, x:x + w]
    alpha = piece[:, :, 3]
    alpha_bin = cv2.threshold(alpha, 128, 255, cv2.THRESH_BINARY)[1]

    # 滑块轮廓 mask(细线,用于白描边精匹配)
    contours, _ = cv2.findContours(alpha_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    outline = np.zeros((h, w), np.uint8)
    cv2.drawContours(outline, contours, -1, 255, 2)

    bg_gray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY)

    # ---- 1. 白描边响应(top-hat:提取比邻域亮的细线)----
    tophat = cv2.morphologyEx(bg_gray, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    res_tophat = cv2.matchTemplate(tophat, outline, cv2.TM_CCOEFF_NORMED)
    _, mv_t, _, ml_t = cv2.minMaxLoc(res_tophat)

    # ---- 2. 暗度响应(缺口内部暗块)----
    local_mean = cv2.blur(bg_gray.astype(np.float32), (61, 61))
    dark_map = np.clip(local_mean - bg_gray.astype(np.float32), 0, 255)
    cv2.normalize(dark_map, dark_map, 0, 255, cv2.NORM_MINMAX)
    dark_soft = cv2.blur(alpha_bin, (5, 5))
    res_dark = cv2.matchTemplate(dark_map.astype(np.uint8), dark_soft, cv2.TM_CCOEFF_NORMED)
    _, mv_d, _, ml_d = cv2.minMaxLoc(res_dark)

    # ---- 3. 背景 Canny × 滑块轮廓 ----
    bg_edges = cv2.Canny(bg_gray, 50, 150)
    res_edge = cv2.matchTemplate(bg_edges, outline, cv2.TM_CCOEFF_NORMED)
    _, mv_e, _, ml_e = cv2.minMaxLoc(res_edge)

    # ---- 精修:tophat 响应面在 top1 邻域抛物线插值 ----
    def refine(res, px, py, radius=8):
        x0, y0 = max(px - radius, 0), max(py - radius, 0)
        sub = res[y0:y0 + 2 * radius + 1, x0:x0 + 2 * radius + 1]
        _, mv, _, ml = cv2.minMaxLoc(sub)
        cx, cy = x0 + ml[0], y0 + ml[1]
        # 亚像素抛物线(x/y 方向独立)
        def parab(c0, cm, cp):
            d = (cm - cp) / (2 * (cm - 2 * c0 + cp) + 1e-9)
            return max(min(d, 1), -1)
        dx = dy = 0.0
        if 0 < cx < res.shape[1] - 1:
            dx = parab(res[cy, cx], res[cy, cx - 1], res[cy, cx + 1])
        if 0 < cy < res.shape[0] - 1:
            dy = parab(res[cy, cx], res[cy - 1, cx], res[cy + 1, cx])
        return cx + dx, cy + dy

    gx_t, gy_t = refine(res_tophat, ml_t[0], ml_t[1])

    # ---- 融合:tophat 为主,若与 dark/edge 一致(±12)则加权平均,否则信任 tophat ----
    cands = [('tophat', gx_t, gy_t, mv_t), ('dark', float(ml_d[0]), float(ml_d[1]), mv_d), ('edge', float(ml_e[0]), float(ml_e[1]), mv_e)]
    log(f'三路定位: {[(n, round(px), round(py), round(c, 3)) for n, px, py, c in cands]}')
    near = [(px, py, c) for n, px, py, c in cands if n != 'tophat' and abs(px - gx_t) <= 12 and abs(py - gy_t) <= 12]
    if near:
        wsum = mv_t + sum(c for _, _, c in near)
        gx = (gx_t * mv_t + sum(px * c for px, py, c in near)) / wsum
        gy = (gy_t * mv_t + sum(py * c for px, py, c in near)) / wsum
    else:
        gx, gy = gx_t, gy_t
    log(f'最终缺口: x={gx:.1f} y={gy:.1f} (tophat {mv_t:.3f} / dark {mv_d:.3f} @ {ml_d} / edge {mv_e:.3f} @ {ml_e})')
    # 候选列表(主 + 邻域扰动回退 + 其他两路)
    seen, ordered = set(), []
    for cx, cy in [(gx, gy), (gx - 8, gy), (gx + 8, gy), (ml_d[0], ml_d[1]), (ml_e[0], ml_e[1])]:
        key = (int(cx) // 25, int(cy) // 25)
        if key in seen:
            continue
        seen.add(key)
        ordered.append((int(round(cx)), int(round(cy))))
    return ordered[:5]


def calc_pow(prefix, target_md5):
    """本地枚举 nonce: md5(prefix + str(n)) == target_md5"""
    t0 = time.time()
    n = 0
    while True:
        if hashlib.md5((prefix + str(n)).encode()).hexdigest() == target_md5:
            return prefix + str(n), max(int((time.time() - t0) * 1000), 1)
        n += 1


def gen_collect(tdc_path, target_x, target_y):
    out = os.path.join(WORK, 'collect_out.json')
    r = subprocess.run(['node', os.path.join(WORK, 'collect_gen.js'), tdc_path,
                        str(target_x), str(target_y), out],
                       capture_output=True, text=True, timeout=30, cwd=WORK)
    if r.returncode != 0:
        raise RuntimeError(f'collect 生成失败: {r.stderr[-500:]}')
    log(r.stderr.strip().splitlines()[-1])
    return json.load(open(out))


def verify(s, sess, c):
    pow_cfg = None
    data = {
        "collect": c['collect'],
        "tlg": str(c['tlg']),
        "eks": c['eks'],
        "sess": sess,
        "ans": c['ans'],
        "tkid": TKID,
        "pow_answer": c['pow_answer'],
        "pow_calc_time": str(c['pow_calc_time']),
    }
    r = s.post('https://turing.captcha.qcloud.com/cap_union_new_verify', data=data, timeout=20)
    r.raise_for_status()
    return r.json()


def get_ticket(captcha_a_id=AID, ua=DEFAULT_UA, retry=3):
    """过腾讯滑块验证,返回 ticket + randstr。

    captcha_a_id: 验证码 AppId(起点风控下发的 CaptchaAId,默认 1600000770)
    返回: {'code': 0, 'ticket': ..., 'randstr': ...}
    """
    s = make_session(ua)
    for attempt in range(1, retry + 1):
        try:
            log(f'===== 第 {attempt} 次尝试 =====')
            d = prehandle(s, ua, captcha_a_id)
            sess = d['sess']
            data = d['data']
            pow_cfg = data['comm_captcha_cfg']['pow_cfg']
            log(f"sess 长度 {len(sess)}, pow prefix={pow_cfg['prefix']}")

            paths = download_assets(s, data)
            fg = data['dyn_show_info']['fg_elem_list']
            slider_fg = next(e for e in fg if e.get('type') == 'slider' or e['id'] == 1)
            start_x = slider_fg['init_pos'][0]
            candidates = find_gap(paths['bg'], paths['sprite'], slider_fg)

            # 多候选重试:verify 失败(errorCode=50)会返回新 sess,可继续用新点位提交
            pa, pt = calc_pow(pow_cfg['prefix'], pow_cfg['md5'])
            log(f'pow: {pa} ({pt}ms)')
            for ci, (gx, gy) in enumerate(candidates):
                c = gen_collect(paths['tdc'], gx, gy)
                c['pow_answer'] = pa
                c['pow_calc_time'] = pt
                log(f'提交候选 {ci + 1}/{len(candidates)}: x={gx} y={gy}')
                res = verify(s, sess, c)
                if res.get('errorCode') == '0':
                    log(f"✓ 验证成功(候选 {ci + 1})")
                    return {'code': 0, 'ticket': res['ticket'], 'randstr': res['randstr']}
                log(f"候选 {ci + 1} 失败 code={res.get('errorCode')}")
                if res.get('sess'):
                    sess = res['sess']   # 服务端返回新 sess,继续重试
                time.sleep(0.4)
            log('本会话候选耗尽')
        except Exception as e:
            log(f'异常: {e}')
        time.sleep(1.5)
    return {'code': -1, 'message': '全部重试失败'}


if __name__ == '__main__':
    import json as _json
    ua = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_UA
    result = get_ticket(ua=ua)
    print(_json.dumps(result, ensure_ascii=False, indent=1))
