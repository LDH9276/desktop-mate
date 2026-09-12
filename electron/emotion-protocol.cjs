const emotions = require('./emotions.json');

const emotionInstruction = [
  '[Mate 캐릭터 반응 형식]',
  '위 메시지에 평소처럼 답변하고, 답변의 맨 마지막에 캐릭터 연출용 상태를 한 줄 붙여 주세요.',
  `허용 상태: ${emotions.map(x => x.label).join(', ')}. 답변 분위기에 맞는 하나를 선택하고 특별한 감정이 없으면 기본을 선택하세요.`,
  '형식: 현재상태: 화남',
  '이 상태는 화면 속 캐릭터의 표정과 동작을 위한 표시입니다. 본문을 감정에 맞추려고 왜곡하거나 AI의 실제 감정이라고 설명하지 마세요.',
  '마지막 상태 줄은 코드 블록, 인용문, 목록, 강조 표시 없이 작성해 주세요.',
].join('\n');

function formatEmotionRequest(text) {
  return `${text.trim()}\n\n${emotionInstruction}`;
}
module.exports = { formatEmotionRequest, emotionInstruction };
