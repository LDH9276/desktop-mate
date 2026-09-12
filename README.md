# Mate

Windows용 ChatGPT 데스크톱 동반 캐릭터입니다. 기본 캐릭터 Mate는 이 저장소의 Three.js 도형 코드로 생성하며, 별도 모델·텍스처·개인 대화 주소를 포함하지 않습니다.

## 포함 범위

- 투명한 항상 위 창, 트레이 숨김과 복원, 창 이동·크기 조절
- 기본 Mate의 시선, 자연스러운 대기·생각·감정 반응 모션
- 완료된 답변 끝의 `현재상태: 화남` 등 상태 태그에 따른 감정 연출
- 사용자 PC에 있는 PMX·VRM ZIP의 로컬 불러오기 기능
- MMD 의상·머리카락 물리의 독립 토글과 가중치
- Windows UI Automation을 통한 사용자가 선택한 일반 ChatGPT 대화 연결

기본 ChatGPT 대화 주소는 빈 값입니다. 앱을 처음 실행한 뒤 설정창에서 직접 연결할 대화 주소를 넣어 주세요. 입력한 주소는 각 PC의 로컬 설정에만 저장되며 이 저장소에는 포함되지 않습니다.

외부 모델 ZIP, PMX·VRM 파일, 모델 텍스처, 실행 파일, 테스트 산출물과 로컬 모델 검증 자료는 `.gitignore`로 제외합니다. 기본 실행 파일은 코드 기반 Mate만 포함합니다.

## 개발

```powershell
npm install
npm test
npm run build
npm run desktop
```

포터블 실행 파일은 다음 명령으로 생성합니다.

```powershell
npm run package:portable
```

## 모션 출처

`public/motions/gene`의 CG-CA Gene 모션은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)이며, 세부 저작자 표시와 변경 내역은 해당 폴더의 `ATTRIBUTION.txt`에 있습니다. 기본 Mate 모델 자체는 외부 캐릭터 모델 파일을 사용하지 않습니다.

## 주요 구성

- `src/Avatar.tsx`: Mate·가져온 모델 렌더링과 애니메이션
- `src/App.tsx`: 채팅, 설정, 로컬 연결 주소 관리
- `electron/bridge.cjs`: ChatGPT 대화 연결 상태와 전송 보호
- `electron/model-library.cjs`: 사용자 ZIP의 로컬 모델 등록
- `electron/main.cjs`: 투명 창, 트레이, 제한된 IPC
