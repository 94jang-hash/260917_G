"""Vercel 서버리스 진입점: 루트의 Flask app을 그대로 노출한다."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import app  # noqa: E402,F401
