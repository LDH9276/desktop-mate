export const chatFontOptions = [
  { value: 'PyeojinGothic', label: '펴진고딕' },
  { value: 'system-ui', label: '시스템 고딕' },
  { value: 'Consolas', label: 'Consolas 고정폭' },
] as const;

export type ChatFont = typeof chatFontOptions[number]['value'];
export type ChatAppearance = {
  width: number;
  height: number;
  characterHeight: number;
  fontSize: number;
  font: ChatFont;
  surface: string;
  border: string;
  header: string;
  composer: string;
  userBubble: string;
  userText: string;
  assistantText: string;
  accent: string;
};

export const defaultChatAppearance: ChatAppearance = {
  width: 390,
  height: 330,
  characterHeight: 270,
  fontSize: 12,
  font: 'PyeojinGothic',
  surface: '#fcfdf9',
  border: '#d4ded4',
  header: '#f6f9f0',
  composer: '#f6f8f0',
  userBubble: '#eaf0e1',
  userText: '#475244',
  assistantText: '#475244',
  accent: '#668457',
};

export const chatNumberRanges: { key: 'width' | 'height' | 'characterHeight' | 'fontSize'; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'width', label: '채팅창 너비', min: 280, max: 720, step: 1, unit: 'px' },
  { key: 'height', label: '채팅창 높이', min: 200, max: 620, step: 1, unit: 'px' },
  { key: 'characterHeight', label: '캐릭터 영역 높이', min: 160, max: 720, step: 1, unit: 'px' },
  { key: 'fontSize', label: '채팅 글자 크기', min: 9, max: 24, step: 1, unit: 'px' },
];

export const chatColorFields: { key: keyof Pick<ChatAppearance, 'surface' | 'border' | 'header' | 'composer' | 'userBubble' | 'userText' | 'assistantText' | 'accent'>; label: string }[] = [
  { key: 'surface', label: '채팅 배경' },
  { key: 'border', label: '테두리' },
  { key: 'header', label: '상단 영역' },
  { key: 'composer', label: '입력창 배경' },
  { key: 'userBubble', label: '내 말풍선' },
  { key: 'userText', label: '내 글자' },
  { key: 'assistantText', label: 'ChatGPT 글자' },
  { key: 'accent', label: '강조색·전송 버튼' },
];

const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function loadChatAppearance(): ChatAppearance {
  const result = { ...defaultChatAppearance };
  try {
    const saved = JSON.parse(localStorage.getItem('mate.chatAppearance') || '{}');
    for (const range of chatNumberRanges) {
      const value = saved?.[range.key];
      if (typeof value === 'number' && Number.isFinite(value)) result[range.key] = Math.min(range.max, Math.max(range.min, value));
    }
    if (chatFontOptions.some(option => option.value === saved?.font)) result.font = saved.font;
    for (const field of chatColorFields) result[field.key] = color(saved?.[field.key], result[field.key]);
  } catch { /* Invalid saved values use the readable default chat theme. */ }
  return result;
}

export function saveChatAppearance(value: ChatAppearance) {
  localStorage.setItem('mate.chatAppearance', JSON.stringify(value));
}
