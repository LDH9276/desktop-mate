# Mate

> ChatGPT 대화와 3D 캐릭터를 바탕화면 가까이에 두는 Windows용 데스크톱 동반자

[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows)](https://www.microsoft.com/windows/)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.5.0-6b8559)](./package.json)

Mate는 화면 위에 항상 떠 있는 작은 캐릭터와 미니 채팅창을 제공합니다. 별도의 API 키를 입력하는 방식이 아니라, 사용자가 Chrome에 열어 둔 **일반 ChatGPT 대화 하나**를 Windows 접근성 기능으로 연결합니다.

기본 캐릭터 `Mate`는 Three.js 도형 코드로 만들어져 저장소에 별도 캐릭터 모델이나 텍스처가 포함되지 않습니다. 가지고 있는 PMX·VRM·GLB 캐릭터도 ZIP으로 불러올 수 있습니다.

## 목차

- [주요 기능](#주요-기능)
- [처음 실행하기](#처음-실행하기)
- [ChatGPT 대화 연결하기](#chatgpt-대화-연결하기)
- [Mate 사용법](#mate-사용법)
- [내 3D 모델 추가하기](#내-3d-모델-추가하기)
- [문제 해결](#문제-해결)
- [개발 및 빌드](#개발-및-빌드)
- [개인정보와 배포 범위](#개인정보와-배포-범위)

## 주요 기능

- 투명한 **항상 위** 창과 화면 가장자리 크기 조절
- 트레이 숨김, 다시 열기, 화면 밖으로 나간 창 복원
- 기본 Mate의 시선, 대기, 생각, 인사, 쓰다듬기 반응
- 답변 끝의 `현재상태: 화남` 같은 상태 태그를 이용한 감정 연출
- 일반 ChatGPT 대화로 메시지 전송 및 답변 표시
- 표, 목록, 제목, 코드 블록을 포함한 Markdown 답변 표시
- PMX·VRM·GLB 모델의 로컬 ZIP 불러오기
- PMX 의상·머리카락 물리 효과와 가중치 개별 설정
- 모델 크기·비율, 조명, 명도, 채도, 외곽선 조절
- 채팅창의 크기·글꼴·글자 크기와 8가지 테마 색상 조절
- 모든 범위형 설정의 숫자 직접 입력 및 1% 단위 조절
- 창 위치, 캐릭터, 외형 설정 자동 저장

## 처음 실행하기

현재 저장소의 코드를 직접 실행하는 방법입니다. 터미널이 익숙하지 않아도 아래 순서대로 진행하면 됩니다.

### 1. 준비물 확인

| 준비물 | 권장 사항 | 용도 |
| --- | --- | --- |
| 운영체제 | Windows 10/11 64비트 | Mate와 Windows 접근성 연결 실행 |
| Node.js | [Node.js 22 LTS](https://nodejs.org/) | 앱 설치와 빌드 |
| ChatGPT | Chrome에서 로그인 | Mate와 대화 연결 |
| Git | 선택 사항 | 명령어로 저장소를 내려받을 때만 필요 |

Node.js를 새로 설치했다면 열려 있던 PowerShell이나 명령 프롬프트를 닫고 다시 열어 주세요.

### 2. 프로젝트 내려받기

터미널을 사용하지 않는다면:

1. GitHub 페이지 위쪽의 **Code** 버튼을 누릅니다.
2. **Download ZIP**을 누릅니다.
3. 내려받은 ZIP의 압축을 풉니다.
4. 압축을 푼 `desktop-mate` 폴더를 엽니다.

Git이 설치되어 있다면 PowerShell에서 다음 명령을 사용해도 됩니다.

```powershell
git clone https://github.com/LDH9276/desktop-mate.git
cd desktop-mate
```

### 3. PowerShell 열기

파일 탐색기로 `desktop-mate` 폴더를 연 다음, 위쪽 주소 표시줄에 `powershell`을 입력하고 Enter를 누릅니다. 현재 폴더를 기준으로 PowerShell이 열립니다.

### 4. 필요한 패키지 설치하기

```powershell
npm ci
```

처음 한 번은 Electron 등 필요한 패키지를 내려받기 때문에 시간이 걸릴 수 있습니다.

### 5. 빌드하고 실행하기

가장 간단한 방법은 다음 한 줄입니다.

```powershell
npm start
```

`npm start`는 앱을 빌드한 뒤 Mate를 실행합니다. 다음부터 이미 빌드된 앱만 빠르게 열고 싶다면 아래 명령을 사용하세요.

```powershell
npm run desktop
```

또는 `npm run build`를 한 번 실행한 뒤, 프로젝트 폴더의 **`Mate 실행.vbs`를 더블 클릭**해도 됩니다.

> Mate 창을 닫은 것처럼 보여도 실제로는 트레이에 보관되어 있을 수 있습니다. 작업 표시줄 오른쪽의 숨겨진 아이콘에서 Mate를 찾아보세요.

## ChatGPT 대화 연결하기

Mate는 계정 전체가 아니라 사용자가 지정한 **대화 하나에만** 연결됩니다.

### 연결 전에 준비하기

1. Chrome에서 [ChatGPT](https://chatgpt.com/)에 로그인합니다.
2. 새 대화를 만들고 메시지를 하나 보내거나, 기존 대화를 엽니다.
3. 주소가 `https://chatgpt.com/c/...` 형태인지 확인합니다.
4. 그 주소를 복사하고 ChatGPT 탭을 열린 상태로 둡니다.

현재 **일반 ChatGPT 대화**를 대상으로 하며 ChatGPT Work/Codex 화면은 지원하지 않습니다.

### Mate에서 연결하기

1. Mate 아래쪽 도구 모음에서 톱니바퀴 모양의 **연결 및 설정**을 누릅니다.
2. 설정 아래쪽의 **ChatGPT 연결**까지 내려갑니다.
3. 복사한 주소를 **ChatGPT 대화 주소**에 붙여 넣습니다.
4. **이 대화가 열린 Chrome 찾기**를 누릅니다.
5. 검색 결과에서 연결할 창을 선택합니다.
6. **이 대화에 연결**을 누릅니다.
7. 채팅창 위쪽 상태가 **연결됨**으로 바뀌면 준비가 끝납니다.

이제 Mate의 입력창에 메시지를 쓰고 Enter를 누르세요. `Shift + Enter`는 줄바꿈입니다. Mate가 같은 ChatGPT 대화에 메시지를 보내고 답변을 가져옵니다.

연결한 탭을 닫거나 다른 대화로 이동하면 안전을 위해 전송이 멈춥니다. Chrome을 최소화한 동안 대화를 읽지 못한다면 창을 복원해 주세요.

## Mate 사용법

| 하고 싶은 일 | 방법 |
| --- | --- |
| 창 옮기기 | 위쪽 **잡아서 이동**을 드래그합니다. 선택 후 방향키로도 움직일 수 있습니다. |
| 창 크기 바꾸기 | 창의 가장자리나 오른쪽 아래 모서리를 드래그합니다. 설정의 75%~300% 버튼도 사용할 수 있습니다. |
| 캐릭터와 함께 창 옮기기 | 캐릭터를 길게 잡은 채 드래그합니다. |
| 캐릭터 쓰다듬기 | 캐릭터를 짧게 클릭하거나 하트 버튼을 누릅니다. |
| 다른 반응 보기 | 반짝이 버튼을 눌러 인사, 기쁨, 생각, 졸림 등의 모션을 선택합니다. |
| 채팅 접기/열기 | 말풍선 버튼을 누릅니다. |
| 잠시 숨기기 | 아래쪽 `−` 버튼을 눌러 트레이에 보관합니다. |
| 화면 밖 창 되찾기 | 트레이 아이콘을 우클릭하고 **창을 화면 안으로 복원**을 누릅니다. |
| 완전히 종료하기 | 설정 맨 아래의 **종료** 또는 트레이 메뉴의 **종료**를 누릅니다. |

설정에서 모델별 크기와 가로·세로 비율, 조명과 색상, 외곽선, 흔들림 민감도를 조절할 수 있습니다. 캐릭터 크기는 50–600%까지 확대할 수 있으며, 커질수록 위아래 위치 조절 범위도 함께 넓어집니다. 변경 내용은 자동 저장됩니다.

### 채팅창 테마와 글꼴

**연결 및 설정 → 채팅창 모양과 글꼴**에서 아래 항목을 바로 바꿀 수 있습니다.

- 채팅창 너비·높이와 캐릭터 영역 높이
- 채팅 글자 크기와 글꼴
- 채팅 배경, 테두리, 상단 영역, 입력창, 말풍선, 글자, 강조색

기본 글꼴은 **펴진고딕**이며, 앱에 포함되어 인터넷이 없는 환경에서도 표시됩니다. 글꼴은 시스템 고딕이나 Consolas 고정폭 글꼴로 변경할 수 있습니다. 숫자 입력칸에서는 값을 직접 입력할 수 있고, 슬라이더는 1% 또는 1px 단위로 움직입니다.

## 내 3D 모델 추가하기

Mate는 모델 파일 하나만 직접 선택하는 대신, 모델과 텍스처를 함께 담은 **ZIP 파일**을 가져옵니다.

### 지원 형식

| 형식 | 준비 방법 | 참고 |
| --- | --- | --- |
| PMX | `.pmx`와 사용 중인 텍스처 폴더를 원래 구조 그대로 ZIP으로 압축 | 의상·머리카락 물리 설정 지원 |
| VRM | `.vrm` 파일을 ZIP으로 압축 | ZIP 안에 여러 모델을 넣을 수 있음 |
| GLB | Blender에서 glTF 2.0의 단일 `.glb`로 내보낸 뒤 ZIP으로 압축 | 외부 파일에 의존하지 않도록 내보내기 권장 |

### 불러오는 순서

1. 톱니바퀴 모양의 **연결 및 설정**을 엽니다.
2. **3D 모델 ZIP 불러오기**를 누릅니다.
3. 준비한 ZIP 파일을 선택합니다.
4. **캐릭터 모델** 목록에서 추가된 모델을 선택합니다.
5. 크기와 비율을 조절하고, PMX라면 의상·머리카락 물리 효과를 맞춥니다.

ZIP을 Mate 실행 파일과 같은 폴더에 두면 앱 시작 시 자동으로 추가할 수도 있습니다. 가져온 모델은 사용자 PC의 Mate 데이터 폴더에만 보관되며 다음 실행에도 유지됩니다.

### ZIP 제한과 주의 사항

- ZIP 파일 크기는 최대 512MB입니다.
- 압축을 푼 전체 크기는 최대 1GB입니다.
- 한 ZIP에는 모델을 최대 30개까지 넣을 수 있습니다.
- 암호가 걸린 ZIP과 심볼릭 링크가 든 ZIP은 지원하지 않습니다.
- PMX의 텍스처가 누락되면 모델이 흰색 또는 투명하게 보일 수 있습니다.
- 모델 제작자와 배포처의 이용 약관을 확인하고, 사용할 권리가 있는 모델만 추가하세요.
- 사용자가 가져온 모델과 텍스처는 이 저장소나 빌드 결과에 자동 포함되지 않습니다.

## 문제 해결

### `npm`을 찾을 수 없다고 나옵니다

[Node.js 22 LTS](https://nodejs.org/)를 설치한 뒤 PowerShell을 완전히 닫고 다시 여세요. 아래 명령으로 설치 여부를 확인할 수 있습니다.

```powershell
node --version
npm --version
```

### PowerShell에서 `npm.ps1` 실행이 차단됩니다

명령 프롬프트를 사용하거나 PowerShell에서 `npm` 대신 `npm.cmd`를 입력하세요.

```powershell
npm.cmd ci
npm.cmd start
```

### `npm run desktop`을 실행했는데 빈 화면 또는 파일 오류가 납니다

먼저 빌드를 완료해야 합니다.

```powershell
npm run build
npm run desktop
```

### ChatGPT 대화를 찾지 못합니다

- 주소가 `https://chatgpt.com/c/...` 형식인지 확인하세요.
- 해당 주소의 탭이 Chrome에 실제로 열려 있어야 합니다.
- 메시지가 하나 이상 있는 일반 ChatGPT 대화를 사용하세요.
- Chrome 창이 최소화되어 있다면 복원하세요.
- ChatGPT 탭을 새로고침한 뒤 다시 **이 대화가 열린 Chrome 찾기**를 누르세요.

### 메시지가 전송되지 않습니다

- 연결 상태가 **연결됨**인지 확인하세요.
- ChatGPT가 이전 답변을 작성 중이면 완료될 때까지 기다리세요.
- ChatGPT 입력창에 직접 작성한 초안이 있으면, 초안을 보호하기 위해 Mate가 전송하지 않습니다. 초안을 보내거나 비운 뒤 다시 시도하세요.
- 연결한 탭에서 다른 대화로 이동했다면 원래 대화를 열고 다시 연결하세요.

Mate는 결과를 확인하지 못한 메시지를 자동으로 다시 보내지 않습니다. **전송 확인 필요**가 보이면 ChatGPT 탭에서 실제 전송 여부를 먼저 확인하세요.

### Mate 창이 사라졌습니다

작업 표시줄 오른쪽의 숨겨진 아이콘에서 Mate를 찾으세요. 아이콘을 클릭하면 다시 열립니다. 창이 화면 밖에 있다면 트레이 메뉴의 **창을 화면 안으로 복원**을 사용하세요.

### 모델 또는 텍스처가 제대로 보이지 않습니다

- PMX와 텍스처를 각각 따로 압축하지 말고 하나의 ZIP에 함께 넣으세요.
- 모델 안에 기록된 상대 경로와 ZIP 안의 폴더 구조를 유지하세요.
- GLB는 Blender에서 glTF 2.0 형식으로 다시 내보내세요.
- ZIP이 손상되었거나 암호화되지 않았는지 확인하세요.

## 개발 및 빌드

### 자주 쓰는 명령

| 명령 | 설명 |
| --- | --- |
| `npm ci` | `package-lock.json` 기준으로 의존성 설치 |
| `npm test` | Node 기반 동작 테스트 실행 |
| `npm run build` | TypeScript 검사, Vite 빌드, Windows 연결 도우미와 아이콘 생성 |
| `npm start` | 빌드 후 Electron 앱 실행 |
| `npm run desktop` | 기존 빌드 결과로 Electron 앱만 실행 |
| `npm run dev` | Vite 개발 서버 실행 |
| `npm run test:ui` | Electron UI 스모크 테스트 |
| `npm run package:portable` | Windows 포터블 실행 파일 생성 |

개발 서버와 Electron을 함께 사용할 때는 터미널 두 개를 엽니다.

첫 번째 터미널:

```powershell
npm run dev
```

두 번째 터미널:

```powershell
$env:MATE_DEV_URL = 'http://127.0.0.1:5173'
npm run desktop
```

포터블 실행 파일은 다음 명령으로 만듭니다.

```powershell
npm run package:portable
```

완성된 파일은 `portable-release` 폴더에 생성됩니다.

### 프로젝트 구조

```text
desktop-mate/
├─ src/                    React UI, 캐릭터 렌더링과 동작
├─ electron/               Electron 창, 트레이, 모델 저장소와 IPC
├─ native/                 Windows UI Automation 기반 ChatGPT 연결 도우미
├─ public/motions/gene/    캐릭터 반응용 VMD 모션
├─ public/physics/         PMX 물리 실행 파일과 라이선스
├─ scripts/                빌드, 패키징, 검증 도구
└─ tests/                  동작 및 회귀 테스트
```

주요 파일:

- `src/App.tsx`: 채팅, 설정, 로컬 연결 주소와 사용자 조작
- `src/Avatar.tsx`: 기본 Mate와 가져온 모델 렌더링·애니메이션
- `electron/main.cjs`: 투명 창, 항상 위, 트레이와 제한된 IPC
- `electron/bridge.cjs`: 연결 상태, 전송 보호와 답변 수신
- `electron/model-library.cjs`: 사용자 ZIP 검증과 로컬 모델 등록
- `native/ChatBridge.cs`: Windows 접근성 API를 통한 ChatGPT 창 연결

## 개인정보와 배포 범위

- ChatGPT 대화 주소와 Mate 설정은 각 PC의 로컬 앱 데이터에 저장됩니다.
- ChatGPT 비밀번호, 세션 쿠키 또는 OpenAI API 키를 이 저장소에 저장하지 않습니다.
- Mate는 사용자가 선택한 대화가 맞는지 전송 전에 확인합니다.
- 이미 보낸 메시지의 결과가 불확실할 때 자동 재전송하지 않습니다.
- 기본 배포에는 코드로 생성되는 Mate만 포함됩니다.
- 외부 PMX·VRM·GLB, 모델 텍스처, 개인 대화 주소와 테스트 산출물은 `.gitignore`로 제외됩니다.

## 모션 및 물리 런타임 출처

`public/motions/gene`의 CG-CA Gene 모션은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)으로 제공됩니다. 세부 저작자 표시와 변경 내용은 [`public/motions/gene/ATTRIBUTION.txt`](./public/motions/gene/ATTRIBUTION.txt)에 있습니다.

기본 채팅 글꼴인 펴진고딕은 서지환(엔파피) 제작 서체이며, [SIL Open Font License](https://openfontlicense.org/) 조건으로 포함했습니다. 출처와 사용 범위는 [눈누의 펴진고딕 안내](https://noonnu.cc/font_page/1586)에서 확인할 수 있습니다.

PMX 물리에는 Ammo.js와 Three.js의 MMDPhysics를 사용합니다. 관련 출처, 변경 내용과 라이선스는 [`public/physics/ATTRIBUTION.txt`](./public/physics/ATTRIBUTION.txt), [`public/physics/AMMO-LICENSE.txt`](./public/physics/AMMO-LICENSE.txt), [`public/physics/THREE-LICENSE.txt`](./public/physics/THREE-LICENSE.txt)에서 확인할 수 있습니다.

---

처음 사용하는 중 막힌 부분이 있다면 [GitHub Issues](https://github.com/LDH9276/desktop-mate/issues)에 사용한 Windows 버전, 실행한 명령, 화면에 나온 오류 문구를 함께 남겨 주세요.
