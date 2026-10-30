# 개발 서버: yut 폴더를 캐시 없이 연다(고친 파일이 바로 보인다). 캐릭터 렌더러의 POST /save/<이름> 은 assets/chars/ 에,
# 건물 렌더러의 POST /save/buildings/<이름> 은 assets/buildings/ 에 저장한다.
# 사용: python tools/save-server.py . 7374  → http://127.0.0.1:7374/tools/render-chars.html?save
import sys, os, re, http.server, functools
ROOT = os.path.abspath(sys.argv[1]); PORT = int(sys.argv[2])
OUT = os.path.join(ROOT, 'assets', 'chars')
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        m = re.fullmatch(r'/save/(buildings/)?([a-z0-9-]+\.(webp|png))', self.path)
        if not m:
            self.send_response(400); self.end_headers(); return
        n = int(self.headers['Content-Length'])
        data = self.rfile.read(n)
        out = os.path.join(ROOT, 'assets', 'buildings') if m.group(1) else OUT
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, m.group(2)), 'wb').write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT)).serve_forever()
