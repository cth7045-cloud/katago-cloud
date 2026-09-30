---
name: app-icon
description: KataGo Cloud 사이트의 앱 아이콘(브라우저 탭·홈 화면·설치 앱·공유 미리보기)을 바꿀 때 쓴다. 사용자가 준 밝은/어두운 아이콘 그림(src/light.png·src/dark.png)을 make_icons.py로 크기별 PNG로 만들어 icons/에 넣고, manifest.json과 각 페이지의 아이콘 경로를 맞춘다. 다크모드에서는 탭 아이콘과 화면 안 아이콘이 어두운 쪽으로 바뀐다.
---

# KataGo Cloud 앱 아이콘

## 지금 구조 (2026-09-30)
- 원본: 사용자가 준 그림 두 장 — `src/light.png`(밝은 바탕), `src/dark.png`(남색 바탕). 1254×1254, 가운데 둥근 사각형, 바깥은 여백(밝은 쪽은 흰색, 어두운 쪽은 투명).
- 만드는 법: `python3 make_icons.py` (Pillow·numpy 필요, 없으면 `pip install pillow numpy`) → `out/`에 아래 10개 + 점검용 `check.png`. 확인 후 `out/*.png`를 사이트 `icons/`로 복사.
- 원본을 바꾸면 스크립트 위쪽 `TILES`의 둥근 사각형 경계(왼·위·오른·아래 픽셀)를 새 그림에 맞게 다시 잰다.

| 파일(icons/) | 크기 | 쓰는 곳 |
|---|---|---|
| `icon-light-32.png` / `icon-dark-32.png` | 32 | 브라우저 탭 — `<link rel="icon" media="(prefers-color-scheme: …)">` 두 줄로 기기 설정에 따라 바뀜 |
| `icon-light-180.png` | 180 | 아이폰 홈 화면(`apple-touch-icon`), 가장자리까지 꽉 채움 |
| `icon-light-192.png` / `icon-light-512.png` | 192·512 | manifest `purpose: any`, 알림 아이콘(192) |
| `icon-light-512-maskable.png` | 512 | manifest `purpose: maskable`(안드로이드 설치 앱) — 배경은 끝까지, 그림은 각 변 약 20% 안쪽, 공유 미리보기(og:image) |
| `icon-dark-192.png` | 192 | 처음 화면 '앱으로 설치' 카드(`.app-icon`, 다크모드일 때) |
| `icon-dark-180/512/512-maskable.png` | | 지금은 안 씀(설치 앱 아이콘을 어두운 쪽으로 바꾸고 싶을 때 manifest에 넣음) |
| `badge-96.png` | 96 | 안드로이드 알림 배지(흰 실루엣) — 따로 둠 |

## 알아둘 한계
- **설치된 앱(홈 화면) 아이콘은 다크모드를 따라 바뀌지 않는다.** 웹 앱 설정(manifest)의 아이콘은 한 벌이고, 기기 테마별 아이콘은 브라우저가 지원하지 않는다. 그래서 설치 앱은 밝은 아이콘 한 가지.
- 아이콘을 바꿀 때는 **파일 이름도 바꾼다**(같은 이름이면 기기가 바뀐 줄 모름). 안드로이드 크롬은 설치된 앱을 열 때 설정을 다시 확인해(하루 한 번쯤) 아이콘을 새로 받는다(바뀌었다는 확인 창이 뜨기도 함). 아이폰은 홈 화면에서 지우고 다시 추가해야 바뀐다.

## 순서
1. 새 그림을 `src/`에 넣고 `TILES` 경계 확인 → `python3 make_icons.py` → `out/check.png`로 32px 판독성·원형으로 잘렸을 때·모서리 경계선이 없는지 확인.
2. `icons/`에 복사(이름을 바꿨다면 옛 파일은 `git rm`, 배포는 `clearCache: true`).
3. 경로 맞추기: `manifest.json` icons, `index.html`·`admin.html`·`guide.html`·`licenses.html`·`analysis.html`(= 소스 저장소 `remote/webui.html`도 같이)의 `rel="icon"`·`apple-touch-icon`·`og:image`, `style.css`의 `.app-icon`(밝게·어둡게 두 곳), `index.html` 알림의 `icon`.
4. 확인: `file icons/*.png`, 가짜 사이트에서 밝게·어둡게(Playwright `colorScheme`) 열어 404 없는지.
5. 배포는 사용자가 원할 때(커밋 → 푸시 → Render `trigger_deploy`).
