# 기본 모델 배포 범위

검토일: 2026-09-12

배포·Git 저장소의 기본 캐릭터는 `Mate` 하나입니다. Mate는 앱 소스의 Three.js 도형으로 생성하며, PMX·VRM·텍스처 파일을 사용하지 않습니다.

사용자가 로컬에서 가져오는 외부 모델 ZIP과 그 안의 모델·텍스처는 저장소, 패키지 입력, 릴리스 파일에 포함하지 않습니다. `.gitignore`가 개발 중 생기는 모델 사본과 검증 산출물도 제외합니다.

`public/motions/gene`의 CG-CA Gene 모션은 CC BY 4.0 자료이며, 저작자 표시와 변경 내역은 `public/motions/gene/ATTRIBUTION.txt`에 포함합니다.
