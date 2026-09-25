# KataGo 클라우드 (웹사이트)

회원마다 전용 GPU(Vast.ai)를 빌려 KataGo로 바둑을 분석하는 서비스의 정적 웹사이트입니다.

- `index.html` 회원가입·로그인, GPU 시작·종료, 사용 내역
- `admin.html` 관리자: 잔액 충전·차감, GPU 강제 종료
- `analysis.html` 분석 화면 (LizzieYzy Next와 같은 배치)
- 서버는 Supabase(로그인·DB·Edge Function)에 있습니다. `config.js`의 값은 공개용 키입니다.

이 폴더는 KataGoVast 프로젝트의 `web/`에서 만들어집니다 (`tools/build_web.py`).

## 라이선스
`analysis.html`과 `assets/`의 바둑판·돌·배경 그림은 LizzieYzy Next(GPL-3.0)에서 가져온 것이므로
GNU GPL v3.0을 따릅니다. 자세한 내용은 `assets/NOTICE.txt`, `assets/LICENSE-GPL-3.0.txt`를 보세요.
