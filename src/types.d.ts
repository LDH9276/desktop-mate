export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; delivery: string };
export type ChatState = { status: 'disconnected' | 'connected' | 'reconnecting' | 'sending' | 'receiving' | 'uncertain'; conversationId: string | null; title: string; detail: string; messages: ChatMessage[] };
export type ChatCandidate = { windowId: number; title: string; conversationId: string | null; supported: boolean; reason: string };
export type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type WindowState = { x: number; y: number; width: number; height: number; scale: number; alwaysOnTop: boolean };
declare global {
  interface Window {
    mate?: {
      openSettings(): Promise<void>; closeSettings(): Promise<void>;
      listModels(): Promise<import('./Avatar').AvatarModel[]>;
      importModel(): Promise<{ models: import('./Avatar').AvatarModel[]; added: string[]; warnings: string[]; duplicate: boolean } | null>;
      state(): Promise<ChatState>; scan(targetUrl?: string): Promise<ChatCandidate[]>;
      connect(id: number, targetUrl?: string): Promise<ChatState>; disconnect(): Promise<void>;
      send(text: string): Promise<ChatState>; hide(): Promise<void>; quit(): Promise<void>;
      startDrag(kind?: 'character' | 'window'): void; endDrag(): void;
      startResize(edge: ResizeEdge): void;
      windowState(): Promise<WindowState>; setWindowScale(scale: number): Promise<WindowState>;
      restoreWindow(): Promise<WindowState>; nudgeWindow(dx: number, dy: number): Promise<WindowState>;
      onWindowState(callback: (state: WindowState) => void): () => void;
      setRegions(regions: { x: number; y: number; width: number; height: number }[]): void;
      onState(callback: (state: ChatState) => void): () => void;
      onMotion(callback: (motion: { kind: 'start' | 'move' | 'end'; x: number; y: number; now: number }) => void): () => void;
      onSettings(callback: () => void): () => void;
    };
  }
}
