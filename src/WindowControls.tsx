import { useEffect, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { Grip, Move, Pin, RotateCcw } from 'lucide-react';
import type { ResizeEdge, WindowState } from './types';
import { NumericSetting } from './SettingsField';
import './window-controls.css';

const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const edges: [ResizeEdge, string][] = [['n', '위'], ['ne', '오른쪽 위'], ['e', '오른쪽'], ['se', '오른쪽 아래'], ['s', '아래'], ['sw', '왼쪽 아래'], ['w', '왼쪽'], ['nw', '왼쪽 위']];
function begin(event: PointerEvent<HTMLButtonElement>, edge?: ResizeEdge) {
  if (event.button !== 0 || !window.mate) return;
  event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
  if (edge) window.mate.startResize(edge); else window.mate.startDrag('window');
}
function end(event: PointerEvent<HTMLButtonElement>) {
  window.mate?.endDrag();
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
}
const pointerEvents = { onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => window.mate?.endDrag() };
function nudge(event: KeyboardEvent<HTMLButtonElement>) {
  const direction = directions[event.key]; if (!direction) return;
  event.preventDefault(); const step = event.shiftKey ? 50 : 10;
  void window.mate?.nudgeWindow(direction[0] * step, direction[1] * step);
}
export function WindowMoveBar() {
  return <div className="window-move-bar" data-interactive>
    <span><Pin size={11} />항상 위</span>
    <button className="window-move" aria-label="창 이동" title="잡아서 창 이동 · 방향키로 이동 · Shift로 빠르게" onPointerDown={event => begin(event)} onKeyDown={nudge} {...pointerEvents}><Move size={12} /><span>잡아서 이동</span></button>
    <button aria-label="창을 화면 안으로 복원" title="창을 화면 안으로 복원" onClick={() => void window.mate?.restoreWindow()}><RotateCcw size={12} /></button>
  </div>;
}
export function WindowResizeHandles() {
  return <>{edges.map(([edge, label]) => <button key={edge} data-interactive className={`window-resize window-resize-${edge}`} aria-label={`${label} 창 크기 조절`} title={`${label} 가장자리를 잡아서 크기 조절`} tabIndex={-1} onPointerDown={event => begin(event, edge)} {...pointerEvents}>{edge === 'se' && <Grip size={14} />}</button>)}</>;
}
export function WindowSizeSettings() {
  const [state, setState] = useState<WindowState>();
  useEffect(() => {
    void window.mate?.windowState().then(setState);
    return window.mate?.onWindowState(setState);
  }, []);
  const setScale = (scale: number) => void window.mate?.setWindowScale(scale).then(setState);
  return <fieldset className="window-size-settings"><legend>창 크기와 위치 <span><Pin size={10} />항상 위에 표시</span></legend>
    <div className="window-size-presets">{[0.75, 1, 1.5, 2, 3].map(scale => <button key={scale} type="button" aria-label={`창 크기 ${scale * 100}%`} aria-pressed={Boolean(state && Math.abs(state.scale - scale) < 0.01)} onClick={() => setScale(scale)}>{scale * 100}%</button>)}</div>
    {state && <NumericSetting id="window-scale" label="창 배율" value={state.scale} min={0.75} max={3} step={0.01} displayScale={100} unit="%" onChange={setScale} />}
    <p>{state ? `${state.width} × ${state.height} · 적용 배율 ${Math.round(state.scale * 100)}%` : '바탕화면 앱에서 창 크기를 조절할 수 있어요.'}<br />가장자리·모서리를 잡아 가로와 세로를 조절하세요.<br />큰 배율은 화면에 맞춰집니다. 위치와 크기는 자동 저장됩니다.</p>
    <button className="window-restore" type="button" onClick={() => void window.mate?.restoreWindow().then(setState)}><RotateCcw size={12} />창을 화면 안으로 복원</button>
  </fieldset>;
}
