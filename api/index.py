# -*- coding: utf-8 -*-
"""Vercel Python Runtime 入口:挂载 FastAPI ASGI app"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

from app.main import app  # noqa: E402,F401  (Vercel 自动识别变量名 app)
