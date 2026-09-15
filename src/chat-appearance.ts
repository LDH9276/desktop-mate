import { getPreference, setPreference } from './preferences';

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
  lineHeight: number;
  letterSpacing: number;
  glyphWidth: number;
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
  lineHeight: 1.8,
  letterSpacing: 0,
  glyphWidth: 1,
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

export const chatNumberRanges: { key: 'width' | 'height' | 'characterHeight' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'glyphWidth'; label: string; min: number; max: number; step: number; unit: string; displayScale?: number }[] = [
  { key: 'width', label: '채팅창 너비', min: 280, max: 720, step: 1, unit: 'px' },
  { key: 'height', label: '채팅창 높이', min: 200, max: 2000, step: 1, unit: 'px' },
  { key: 'characterHeight', label: '캐릭터 영역 높이', min: 160, max: 2000, step: 1, unit: 'px' },
  { key: 'fontSize', label: '채팅 글자 크기', min: 9, max: 24, step: 1, unit: 'px' },
  { key: 'lineHeight', label: '줄 간격', min: 1, max: 3, step: 0.01, unit: '%', displayScale: 100 },
  { key: 'letterSpacing', label: '자간', min: -1, max: 5, step: 0.1, unit: 'px' },
  { key: 'glyphWidth', label: '글자 가로 비율(장평)', min: 0.8, max: 1.2, step: 0.01, unit: '%', displayScale: 100 },
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
    const saved = JSON.parse(getPreference('mate.chatAppearance') || '{}');
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
  setPreference('mate.chatAppearance', JSON.stringify(value));
}
