using System;
using System.Globalization;

// Pure text rules shared by the UIA sender and native regression tests.
internal static class ComposerGuard {
    internal static bool Blank(string text) {
        if (text == null) return true;
        foreach (char c in text) {
            // Rich editors may expose an otherwise empty paragraph with BOM,
            // zero-width space, word joiner, bidi marks, or a NUL terminator.
            if (!Char.IsWhiteSpace(c) && c != '\0' && Char.GetUnicodeCategory(c) != UnicodeCategory.Format) return false;
        }
        return true;
    }
    internal static string Normalize(string text) {
        return (text ?? "").Replace("\r\n", "\n").Replace('\r', '\n').TrimEnd('\n', '\0');
    }
    internal static bool Same(string left, string right) {
        return String.Equals(Normalize(left), Normalize(right), StringComparison.Ordinal);
    }
    internal static bool Placeholder(string text) {
        switch (text) {
            case "Ask anything": case "Message ChatGPT": case "Send a message":
            case "무엇이든 물어보세요": case "ChatGPT에게 물어보세요": case "ChatGPT에게 메시지 보내기": case "메시지": return true;
            default: return false;
        }
    }
    internal static bool Empty(string value, string text, bool hasText, string name, string help) {
        if (hasText && !Blank(text)) return false;
        if (Blank(value)) return true;
        // Never discard a typed phrase merely because it resembles a hint.
        // Require a separately empty text range AND a matching accessible hint.
        return hasText && Placeholder(value) && (value == name || value == help);
    }
    internal static bool Matches(string value, string text, bool hasText, string expected) {
        return Same(value, expected) && (!hasText || Same(text, expected));
    }
    internal static bool RenderedPlaceholder(string value, string text, bool hasText, string inputId, string name, bool voiceReady, bool hasSubmit) {
        // The live ChatGPT composer renders its hint as a text child and exposes
        // it as BOTH Value and Text. The empty composer has a voice button;
        // a typed draft (even the same phrase) replaces it with a send button.
        return inputId == "prompt-textarea" && (name == "ChatGPT와 채팅" || name == "Chat with ChatGPT")
            && hasText && Placeholder(value) && Same(value, text) && voiceReady && !hasSubmit;
    }
}
