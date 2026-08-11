# Turini Render 배포 안내

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## Render 배포

### 1. 무료 데이터베이스 만들기

1. Neon에 가입한 뒤 **New Project**를 누릅니다.
2. 생성된 프로젝트에서 **Connect**를 누릅니다.
3. 연결 방식은 **Pooled connection**을 선택하고 `postgresql://`로 시작하는 연결 주소를 복사합니다.

### 2. GitHub와 Render 연결하기

1. 이 폴더의 기존 파일을 GitHub 저장소에 덮어씁니다.
2. Render의 기존 Turini Web Service에서 **Environment**를 엽니다.
3. 환경변수 `DATABASE_URL`을 추가하고 Neon에서 복사한 연결 주소를 값으로 붙여 넣습니다.
4. 환경변수 `OPENAI_API_KEY`를 추가하고 OpenAI에서 발급받은 실제 API 키를 붙여 넣습니다.
5. 환경변수 `OPENAI_MODEL`을 추가하고 `gpt-4.1-mini-2025-04-14`를 입력합니다.
6. **Save, rebuild, and deploy**를 누릅니다.
7. 배포가 끝나면 기존 `onrender.com` 주소에서 새 로그인 화면과 GPT 코칭을 사용할 수 있습니다.

수동 Web Service 방식이라면 다음 값을 사용합니다.

- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Environment Variable: `NODE_VERSION=22.13.0`
- Environment Variable: `DATABASE_URL=Neon에서 복사한 연결 주소`
- Environment Variable: `OPENAI_API_KEY=OpenAI에서 발급받은 실제 키`
- Environment Variable: `OPENAI_MODEL=gpt-4.1-mini-2025-04-14`

## 주의

- `.env` 파일과 실제 API 키는 GitHub에 올리지 마세요.
- `DATABASE_URL`도 GitHub 파일에 직접 적지 말고 Render의 Environment에만 저장하세요.
- `OPENAI_API_KEY`도 GitHub 파일에 직접 적지 말고 Render의 Environment에만 저장하세요.
- 무료 Render 서비스는 일정 시간 미사용 시 잠들 수 있어 첫 접속이 느릴 수 있습니다.
- Render의 무료 PostgreSQL은 30일 뒤 만료되므로 이 앱은 무료 Neon PostgreSQL 사용을 기준으로 만들었습니다.
