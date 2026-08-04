# Turini Render 배포 안내

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## Render 배포

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. Render에서 **New + → Blueprint**를 선택합니다.
3. 해당 GitHub 저장소를 연결합니다.
4. 저장소 루트의 `render.yaml`이 자동으로 감지되면 **Apply**를 누릅니다.
5. 배포 완료 후 생성된 `onrender.com` 주소를 공유합니다.

수동 Web Service 방식이라면 다음 값을 사용합니다.

- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Environment Variable: `NODE_VERSION=22.13.0`

## 주의

- `.env` 파일과 실제 API 키는 GitHub에 올리지 마세요.
- 무료 Render 서비스는 일정 시간 미사용 시 잠들 수 있어 첫 접속이 느릴 수 있습니다.
