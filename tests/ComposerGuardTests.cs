using System;
internal class ComposerGuardTests {
    static int checks;
    static void Check(bool condition, string label) { checks++; if (!condition) throw new Exception(label); }
    static void Main() {
        foreach (string empty in new [] { "", " \r\n\t", "\u200b", "\ufeff\u2060\u200e\u200f", "\0\r\n" }) {
            Check(ComposerGuard.Empty(empty, empty, true, "Ask anything", ""), "empty editor markers");
            Check(ComposerGuard.Empty(empty, null, false, "Ask anything", ""), "value-only empty editor");
        }
        foreach (string draft in new [] { "hello", "메모", "\u200b실제 초안", "Ask anything", "무엇이든 물어보세요", "\ufffc", "\ud83d\udc31", "\u0301" }) {
            Check(!ComposerGuard.Empty(draft, draft, true, draft, draft), "real draft is protected");
            Check(!ComposerGuard.Empty(draft, null, false, draft, draft), "value-only real draft is protected");
        }
        Check(ComposerGuard.Empty("Ask anything", "\r\n", true, "Ask anything", ""), "independent empty range confirms English hint");
        Check(ComposerGuard.Empty("무엇이든 물어보세요", "\u200b", true, "", "무엇이든 물어보세요"), "independent empty range confirms Korean hint");
        Check(!ComposerGuard.Empty("unknown content", "", true, "unknown content", ""), "unknown values are not discarded");
        Check(!ComposerGuard.Empty("Ask anything", "", true, "Other field", ""), "unconfirmed hint is protected");
        Check(!ComposerGuard.Empty("", "real draft", true, "", ""), "contradicting text pattern is protected");
        Check(ComposerGuard.Matches("안녕\r\n\r\n[Mate]\r\n상태\r\n", "안녕\n\n[Mate]\n상태\n", true, "안녕\n\n[Mate]\n상태"), "Windows newlines are equivalent");
        Check(!ComposerGuard.Matches("원문", "사용자가 변경함", true, "원문"), "editing during preparation is detected");
        Check(!ComposerGuard.Same("a  b", "a b"), "internal spaces are significant");
        Check(!ComposerGuard.Same(" 원문", "원문"), "leading spaces are significant");
        const string hint = "ChatGPT에게 물어보세요";
        Check(ComposerGuard.RenderedPlaceholder(hint, hint, true, "prompt-textarea", "ChatGPT와 채팅", true, false), "captured live empty composer");
        Check(!ComposerGuard.RenderedPlaceholder(hint, hint, true, "prompt-textarea", "ChatGPT와 채팅", false, true), "typing the same hint is a protected draft");
        Check(!ComposerGuard.RenderedPlaceholder(hint, hint, true, "prompt-textarea", "ChatGPT와 채팅", true, true), "any send control prevents bypass");
        Check(!ComposerGuard.RenderedPlaceholder(hint, hint, true, "prompt-textarea", "ChatGPT와 채팅", false, false), "missing voice control is inconclusive");
        Check(!ComposerGuard.RenderedPlaceholder("실제 초안", "실제 초안", true, "prompt-textarea", "ChatGPT와 채팅", true, false), "normal draft stays protected");
        Check(!ComposerGuard.RenderedPlaceholder(hint, hint, true, "other-input", "ChatGPT와 채팅", true, false), "other inputs cannot match");
        var prior = new [] { "u1", "a1", "u2", "a2", "u3", "a3" };
        Check(TranscriptGuard.Boundary(prior, new [] { "u2", "a2", "u3", "a3", "pending" }) == 4, "captured virtualization removes older rows");
        Check(TranscriptGuard.Boundary(prior, new [] { "u3", "a3", "pending", "reply" }) == 2, "latest pair anchors the reply");
        Check(TranscriptGuard.Boundary(prior, new [] { "older", "u1", "a1", "u2", "a2", "u3", "a3", "pending" }) == 7, "older rows reappear on scroll");
        Check(TranscriptGuard.Boundary(prior, new [] { "changed question", "a3", "pending" }) == -1, "changed anchor is rejected");
        Check(TranscriptGuard.Boundary(prior, new [] { "u3", "a3", "u3", "a3" }) == -1, "ambiguous repeat is rejected");
        Check(TranscriptGuard.Boundary(new string[0], new [] { "pending" }) == -1, "missing baseline is rejected");
        Check(TranscriptGuard.Complete(false, true, true, "확인", 1500), "fast answer completes even if generation was not observed");
        Check(!TranscriptGuard.Complete(true, true, true, "부분 답변", 1500), "generation in progress is not complete");
        Check(!TranscriptGuard.Complete(false, true, false, "부분 답변", 1500), "missing final actions is not complete");
        Check(!TranscriptGuard.Complete(false, true, true, "변경 중", 500), "changing text waits for stabilization");
        Check(!TranscriptGuard.Complete(false, false, true, "답변", 1500), "response without our message is not complete");
        Check(TranscriptGuard.ReadableContent("", true, true, true) == TranscriptGuard.ImageResult, "completed image result gets readable fallback");
        Check(TranscriptGuard.ReadableContent("", true, true, false) == TranscriptGuard.GeneratedResult, "other non-text result gets readable fallback");
        Check(TranscriptGuard.ReadableContent("**굵게**", true, true, false) == "**굵게**", "existing markdown content is preserved");
        Check(TranscriptGuard.ReadableContent("", true, false, true) == "", "unfinished image result remains pending");
        Console.WriteLine("Composer guard: " + checks + " checks passed; no UI or ChatGPT access.");
    }
}
