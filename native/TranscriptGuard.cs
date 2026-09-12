using System;
internal static class TranscriptGuard {
    internal const string ImageResult = "이미지 생성이 완료되었습니다.\n\n원본 이미지는 ChatGPT 창에서 확인해 주세요.";
    internal const string GeneratedResult = "생성 결과가 완료되었습니다.\n\n원본 결과는 ChatGPT 창에서 확인해 주세요.";
    internal static string ReadableContent(string content, bool assistant, bool finalActions, bool hasImage) {
        if (!String.IsNullOrWhiteSpace(content)) return content;
        if (!assistant || !finalActions) return "";
        return hasImage ? ImageResult : GeneratedResult;
    }
    internal static bool Complete(bool generating, bool acknowledged, bool finalActions, string answer, long stableMilliseconds) {
        return !generating && acknowledged && finalActions && !String.IsNullOrWhiteSpace(answer) && stableMilliseconds >= 1400;
    }
    // ChatGPT virtualizes older turns. Match a unique visible suffix of the
    // pre-send transcript, instead of requiring all old rows to stay mounted.
    internal static int Boundary(string[] baseline, string[] current) {
        if (baseline.Length == 0) return -1;
        int minimum = Math.Min(2, baseline.Length), best = 0, boundary = -1;
        bool ambiguous = false;
        for (int end = 0; end < current.Length; end++) {
            int count = 0;
            while (count < baseline.Length && count <= end && baseline[baseline.Length - 1 - count] == current[end - count]) count++;
            if (count < minimum || count < best) continue;
            if (count > best) { best = count; boundary = end + 1; ambiguous = false; }
            else ambiguous = true;
        }
        return ambiguous ? -1 : boundary;
    }
}
