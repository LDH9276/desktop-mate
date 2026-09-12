using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Automation.Text;

// Strict, local UIA transport. No mouse, keyboard injection, clipboard, browser
// debugging, private endpoints, credentials, or ChatGPT process modification.
// Unsupported accessibility providers fail closed instead of guessing a target.
internal class ChatBridge {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4000000 };
    // Chrome's accessibility tree may omit the visible https:// scheme even
    // though the loaded document is HTTPS. Keep the host/path exact.
    static readonly Regex ChatUrl = new Regex(@"^(?:https://)?chatgpt\.com/(?:g/[^/]+/)?c/([a-zA-Z0-9-]+)(?:[?#].*)?$", RegexOptions.IgnoreCase);
    static AutomationElement boundWindow;
    static string boundConversation, boundTitle;
    static int boundPid, boundHandle;
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    static List<Turn> baseline;
    static string pendingText;
    static string lastAnswer;
    static Stopwatch answerStable;
    const string ExpectedTitle = "코덱스 연결";

    [STAThread]
    static void Main() {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        string line;
        while ((line = Console.ReadLine()) != null) {
            object id = null;
            try {
                var cmd = Json.Deserialize<Dictionary<string, object>>(line);
                id = cmd["id"];
                Console.WriteLine(Json.Serialize(new { id = id, ok = true, result = Run(cmd) }));
            } catch (Exception ex) {
                var failure = ex as SendFailure;
                bool retryable = failure == null ? RetryableRead(ex) : failure.Retryable;
                string message = String.IsNullOrWhiteSpace(ex.Message) ? "ChatGPT 접근성 요소를 읽지 못했어요 (" + ex.GetType().Name + ", 0x" + ex.HResult.ToString("X8") + ")." : ex.Message;
                if (retryable) message = AvailabilityMessage();
                Console.WriteLine(Json.Serialize(new { id = id, ok = false, error = message, errorCode = failure == null ? (retryable ? "ACCESSIBILITY_UNAVAILABLE" : ex.GetType().FullName) : failure.Code, retryable = retryable, notSent = failure != null && failure.NotSent, diagnostic = ex.Data["diagnostic"] ?? ex.StackTrace }));
            }
        }
    }
    static object Run(Dictionary<string, object> cmd) {
        switch ((string)cmd["command"]) {
            case "scan": return Scan(TargetConversation(cmd));
            case "connect": return Connect(Convert.ToInt32(cmd["windowId"]), TargetConversation(cmd));
            case "status": return ReadStable(Status);
            case "inspect-composer": return ReadStable(InspectComposer);
            case "inspect-window": return InspectWindow();
            case "inspect-turns": return Turns(Verify());
            case "inspect-turn-markers": return InspectTurnMarkers();
            case "inspect-latest-tree": return InspectLatestTree();
            case "clear-matching-draft": return ClearMatchingDraft((string)cmd["text"]);
            case "send": return Send((string)cmd["text"]);
            case "poll": return ReadStable(Poll);
            case "disconnect": Clear(); return new { connected = false };
            default: throw new Exception("지원하지 않는 연결 명령입니다.");
        }
    }
    static string TargetConversation(Dictionary<string, object> cmd) {
        object raw;
        if (!cmd.TryGetValue("targetUrl", out raw) || raw == null || String.IsNullOrWhiteSpace(Convert.ToString(raw))) return null;
        var match = ChatUrl.Match(Convert.ToString(raw).Trim());
        if (!match.Success) throw new Exception("올바른 ChatGPT 대화 주소를 입력해 주세요. 예: https://chatgpt.com/c/대화-ID");
        return match.Groups[1].Value;
    }
    static AutomationElement[] Children(AutomationElement root, Condition condition) {
        return root.FindAll(TreeScope.Descendants, condition).Cast<AutomationElement>().Take(5000).ToArray();
    }
    static string Name(AutomationElement el) { return el.Current.Name ?? ""; }
    static string Runtime(AutomationElement el) { return String.Join(".", el.GetRuntimeId()); }
    static ValuePattern Value(AutomationElement el) {
        object value; return el.TryGetCurrentPattern(ValuePattern.Pattern, out value) ? (ValuePattern)value : null;
    }
    static string Url(AutomationElement doc) {
        var value = Value(doc);
        if (value != null && ChatUrl.IsMatch(value.Current.Value ?? "")) return value.Current.Value;
        string name = Name(doc);
        return ChatUrl.IsMatch(name) ? name : null;
    }
    static AutomationElement Document(AutomationElement win, string targetConversation = null) {
        var docs = Children(win, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
        var matches = docs.Where(d => Url(d) != null).ToArray();
        if (targetConversation != null) matches = matches.Where(d => String.Equals(ChatUrl.Match(Url(d)).Groups[1].Value, targetConversation, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (matches.Length == 0 && targetConversation != null) throw new AccessPending();
        if (matches.Length != 1) throw new Exception(targetConversation == null
            ? "현재 대화의 고유 주소를 접근성 기능으로 확인할 수 없어요. 일반 ChatGPT의 기존 대화를 열어 주세요. 이 버전의 앱이 주소를 제공하지 않으면 연결을 지원하지 않습니다."
            : "설정한 대화 주소와 일치하는 Chrome 탭을 하나로 특정하지 못했어요. 해당 탭을 열어 둔 뒤 다시 찾아 주세요.");
        return matches[0];
    }
    static bool MatchesTitle(AutomationElement win, AutomationElement doc) {
        string[] names = { Name(win), Name(doc) };
        return names.Any(name => name == ExpectedTitle || name == ExpectedTitle + " - ChatGPT" || name == "ChatGPT - " + ExpectedTitle || name.StartsWith(ExpectedTitle + " - ", StringComparison.OrdinalIgnoreCase));
    }
    static bool SupportedHost(string processName) {
        return String.Equals(processName, "ChatGPT", StringComparison.OrdinalIgnoreCase) || String.Equals(processName, "chrome", StringComparison.OrdinalIgnoreCase);
    }
    static string ConversationUrl(AutomationElement win, AutomationElement doc) {
        string direct = Url(doc);
        if (direct != null) return direct;
        var matches = Children(win, Condition.TrueCondition).Select(Url).Where(url => url != null).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (matches.Length != 1) throw new Exception("현재 대화의 고유 주소를 접근성 기능으로 확인할 수 없어요. Chrome에서는 연결할 ChatGPT 탭을 현재 탭으로 열어 주세요.");
        return matches[0];
    }
    static AutomationElement Input(AutomationElement doc) {
        var elements = Children(doc, Condition.TrueCondition);
        var matches = elements.Where(e => {
            string name = Name(e), aid = e.Current.AutomationId ?? "";
            return aid == "prompt-textarea" || (e.Current.ControlType == ControlType.Edit && Regex.IsMatch(name, @"^(Message ChatGPT|Ask anything|Send a message|무엇이든 물어보세요|ChatGPT에게 메시지 보내기|메시지)$", RegexOptions.IgnoreCase));
        }).ToArray();
        if (matches.Length != 1) throw new Exception("일반 ChatGPT의 입력창을 하나로 특정하지 못했어요. Work/Codex 화면은 지원하지 않습니다.");
        var value = Value(matches[0]);
        if (value == null || value.Current.IsReadOnly) throw new Exception("이 ChatGPT 입력창은 마우스 없는 직접 입력을 지원하지 않아요. 전송을 중단했습니다.");
        return matches[0];
    }
    static AutomationElement[] SubmitCandidates(AutomationElement doc) {
        return Children(doc, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button)).Where(e => {
            string aid = e.Current.AutomationId ?? "";
            return aid == "send-button" || Regex.IsMatch(Name(e), @"^(Send prompt|Send message|Send|메시지 보내기|메시지 전송|프롬프트 보내기|전송)$", RegexOptions.IgnoreCase);
        }).ToArray();
    }
    static AutomationElement Submit(AutomationElement doc) {
        var matches = SubmitCandidates(doc);
        if (matches.Length != 1 || !matches[0].Current.IsEnabled) throw new Exception("전송 버튼이 준비되지 않았어요. ChatGPT 입력창에 작성된 문장을 확인해 주세요.");
        object pattern;
        if (!matches[0].TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) throw new Exception("전송 버튼의 직접 호출이 지원되지 않아요.");
        return matches[0];
    }
    static bool Generating(AutomationElement doc) {
        return Children(doc, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button)).Any(e => Regex.IsMatch(Name(e), @"^(Stop generating|Stop streaming|Stop|생성 중지|답변 생성 중지|중지)$", RegexOptions.IgnoreCase));
    }
    static List<Turn> Turns(AutomationElement doc) {
        // Retry callers must acquire a fresh document, never the stale element.
        return TurnsCore(doc);
    }
    static List<Turn> TurnsCore(AutomationElement doc) {
        // ChatGPT exposes turn headings/groups through its accessibility tree.
        // A provider with a different structure is deliberately unsupported.
        var all = Children(doc, Condition.TrueCondition);
        var result = new List<Turn>();
        var used = new HashSet<string>();
        foreach (var item in all) {
            string label = Name(item).Trim();
            bool actionMarker = Regex.IsMatch(label, @"^(Message actions|Response actions|내 메시지 작업|응답 작업)$", RegexOptions.IgnoreCase);
            bool user = Regex.IsMatch(label, @"^(You said:|You said|나의 말:|나의 말|사용자:|Message actions|내 메시지 작업)$", RegexOptions.IgnoreCase);
            bool assistant = Regex.IsMatch(label, @"^(ChatGPT said:|ChatGPT said|ChatGPT의 말:|ChatGPT의 말|ChatGPT:|Response actions|응답 작업)$", RegexOptions.IgnoreCase);
            if (!user && !assistant) continue;
            AutomationElement group = actionMarker ? TreeWalker.RawViewWalker.GetParent(item) : item;
            if (!actionMarker) {
                for (int depth = 0; depth < 5 && group != null; depth++) {
                    var aid = group.Current.AutomationId ?? "";
                    if (aid.StartsWith("conversation-turn-") || (group.Current.ControlType == ControlType.Group && Children(group, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text)).Length > 1)) break;
                    group = TreeWalker.RawViewWalker.GetParent(group);
                    if (group == null || Runtime(group) == Runtime(doc)) { group = null; break; }
                }
            }
            if (group == null || !used.Add(Runtime(group))) continue;
            bool finalActions = assistant && actionMarker && Children(item, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))
                .Any(e => e.Current.IsEnabled && Regex.IsMatch(Name(e), @"^(응답 복사|Copy response)$", RegexOptions.IgnoreCase));
            string identity = PlainMessageText(doc, group, actionMarker ? item : null);
            string text = MessageText(doc, group, actionMarker ? item : null);
            bool hasImage = assistant && Children(group, Condition.TrueCondition).Any(e => e.Current.ControlType == ControlType.Image
                || Regex.IsMatch(Name(e), @"^(생성된 이미지|Generated image)(:|：|$)", RegexOptions.IgnoreCase));
            text = TranscriptGuard.ReadableContent(text, assistant, finalActions, hasImage);
            identity = TranscriptGuard.ReadableContent(identity, assistant, finalActions, hasImage);
            if (text.Length > 0) result.Add(new Turn { role = user ? "user" : "assistant", content = text, identity = identity, finalActions = finalActions });
        }
        return result;
    }
    static string MessageText(AutomationElement doc, AutomationElement group, AutomationElement actions) {
        // Use the raw message container, not ControlViewWalker's thread-wide
        // parent. Its text range retains inline bold/code text that leaf-name
        // enumeration omits. Remove UI controls by their ranges, never by words.
        object pattern;
        if (!doc.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) throw new Exception("이 대화의 메시지 본문 범위를 읽을 수 없습니다.");
        var text = (TextPattern)pattern; var body = text.RangeFromChild(group);
        if (actions != null) body.MoveEndpointByRange(TextPatternRangeEndpoint.End, text.RangeFromChild(actions), TextPatternRangeEndpoint.Start);
        var replacements = new List<RangeReplacement>();
        // Chromium exposes rendered Markdown as UIA lists, tables and headers.
        // Recreate those delimiters because the document TextPattern otherwise
        // flattens them into plain text before Mate receives the response.
        foreach (var element in Children(group, Condition.TrueCondition).Where(e => e.Current.ControlType == ControlType.Table)) {
            try {
                var range = text.RangeFromChild(element); string markdown = MarkdownTable(text, element);
                if (markdown != null && Inside(range, body) && !replacements.Any(r => Overlaps(r.range, range))) replacements.Add(new RangeReplacement(range, markdown));
            } catch { /* An incomplete/unsupported table remains readable as plain text. */ }
        }
        foreach (var element in Children(group, Condition.TrueCondition).Where(e => e.Current.ControlType == ControlType.List)) {
            try {
                var range = text.RangeFromChild(element); string markdown = MarkdownList(text, element);
                if (markdown != null && Inside(range, body) && !replacements.Any(r => Overlaps(r.range, range))) replacements.Add(new RangeReplacement(range, markdown));
            } catch { /* Fall back to the document text while a list is rerendering. */ }
        }
        foreach (var element in Children(group, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Header))) {
            try {
                var range = text.RangeFromChild(element); string heading = MarkdownRange(range).Trim();
                if (heading.Length > 0 && Inside(range, body) && !replacements.Any(r => Overlaps(r.range, range))) replacements.Add(new RangeReplacement(range, "### " + heading + "\n"));
            } catch { /* Header text still appears in the plain range. */ }
        }
        foreach (var element in Children(group, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text))) {
            try {
                var range = text.RangeFromChild(element); if (!Inside(range, body) || replacements.Any(r => Overlaps(r.range, range))) continue;
                string value = range.GetText(80000).Trim(); if (value.Length == 0) continue;
                object weight = range.GetAttributeValue(TextPattern.FontWeightAttribute), italic = range.GetAttributeValue(TextPattern.IsItalicAttribute), font = range.GetAttributeValue(TextPattern.FontNameAttribute);
                bool heading = Regex.IsMatch(element.Current.LocalizedControlType ?? "", @"^(제목|heading)$", RegexOptions.IgnoreCase);
                bool bold = weight is int && (int)weight >= 600, emphasis = italic is bool && (bool)italic;
                bool code = font is string && Regex.IsMatch((string)font, @"(mono|consolas|courier|cascadia)", RegexOptions.IgnoreCase);
                string markdown = null;
                if (heading) markdown = "\n### " + value + "\n";
                else if (code && (value.Contains("\n") || value.Contains("\r"))) markdown = "\n```\n" + value + "\n```\n";
                else if (bold || emphasis || code) markdown = MarkdownFormat(value, bold, emphasis, code);
                if (markdown != null) replacements.Add(new RangeReplacement(range, markdown));
            } catch { /* A plain text run remains readable if style metadata changes. */ }
        }
        foreach (var button in Children(group, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))) {
            try {
                var range = text.RangeFromChild(button);
                if (Inside(range, body) && !replacements.Any(r => Overlaps(r.range, range))) replacements.Add(new RangeReplacement(range, ""));
            } catch { /* A detached action is already absent from the text. */ }
        }
        replacements.Sort((left, right) => left.range.CompareEndpoints(TextPatternRangeEndpoint.Start, right.range, TextPatternRangeEndpoint.Start));
        var cursor = body.Clone(); var parts = new StringBuilder();
        foreach (var replacement in replacements) {
            if (replacement.range.CompareEndpoints(TextPatternRangeEndpoint.Start, cursor, TextPatternRangeEndpoint.Start) > 0) {
                var before = cursor.Clone(); before.MoveEndpointByRange(TextPatternRangeEndpoint.End, replacement.range, TextPatternRangeEndpoint.Start);
                parts.Append(MarkdownRange(before));
            }
            parts.Append(replacement.markdown);
            if (replacement.range.CompareEndpoints(TextPatternRangeEndpoint.End, cursor, TextPatternRangeEndpoint.Start) > 0) cursor.MoveEndpointByRange(TextPatternRangeEndpoint.Start, replacement.range, TextPatternRangeEndpoint.End);
        }
        parts.Append(MarkdownRange(cursor));
        string result = Regex.Replace(parts.ToString().Replace("\uFFFC", ""), @"(?m)^\s*[•●▪]\s+", "- ");
        if (result.Contains("| ---")) result = Regex.Replace(result, @"(?m)^\s*(표\s*)?복사\s*$", "");
        return result.Trim();
    }
    static string PlainMessageText(AutomationElement doc, AutomationElement group, AutomationElement actions) {
        object pattern; if (!doc.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) throw new Exception("이 대화의 메시지 본문 범위를 읽을 수 없습니다.");
        var text = (TextPattern)pattern; var body = text.RangeFromChild(group);
        if (actions != null) body.MoveEndpointByRange(TextPatternRangeEndpoint.End, text.RangeFromChild(actions), TextPatternRangeEndpoint.Start);
        var excluded = new List<TextPatternRange>();
        foreach (var button in Children(group, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))) {
            try { var range = text.RangeFromChild(button); if (Inside(range, body)) excluded.Add(range); } catch {}
        }
        excluded.Sort((left, right) => left.CompareEndpoints(TextPatternRangeEndpoint.Start, right, TextPatternRangeEndpoint.Start));
        var cursor = body.Clone(); var parts = new StringBuilder();
        foreach (var range in excluded) {
            if (range.CompareEndpoints(TextPatternRangeEndpoint.Start, cursor, TextPatternRangeEndpoint.Start) > 0) {
                var before = cursor.Clone(); before.MoveEndpointByRange(TextPatternRangeEndpoint.End, range, TextPatternRangeEndpoint.Start); parts.Append(before.GetText(80000));
            }
            if (range.CompareEndpoints(TextPatternRangeEndpoint.End, cursor, TextPatternRangeEndpoint.Start) > 0) cursor.MoveEndpointByRange(TextPatternRangeEndpoint.Start, range, TextPatternRangeEndpoint.End);
        }
        parts.Append(cursor.GetText(80000)); return parts.ToString().Replace("\uFFFC", "").Trim();
    }
    static bool Inside(TextPatternRange range, TextPatternRange body) {
        return range.CompareEndpoints(TextPatternRangeEndpoint.Start, body, TextPatternRangeEndpoint.End) < 0
            && range.CompareEndpoints(TextPatternRangeEndpoint.End, body, TextPatternRangeEndpoint.Start) > 0;
    }
    static bool Overlaps(TextPatternRange left, TextPatternRange right) {
        return left.CompareEndpoints(TextPatternRangeEndpoint.Start, right, TextPatternRangeEndpoint.End) < 0
            && left.CompareEndpoints(TextPatternRangeEndpoint.End, right, TextPatternRangeEndpoint.Start) > 0;
    }
    static string MarkdownRange(TextPatternRange range) {
        var remaining = range.Clone(); var result = new StringBuilder(); int guard = 0;
        try {
            while (remaining.CompareEndpoints(TextPatternRangeEndpoint.Start, range, TextPatternRangeEndpoint.End) < 0 && guard++ < 20000) {
                var part = remaining.Clone(); part.MoveEndpointByRange(TextPatternRangeEndpoint.End, part, TextPatternRangeEndpoint.Start);
                if (part.MoveEndpointByUnit(TextPatternRangeEndpoint.End, TextUnit.Format, 1) == 0) break;
                if (part.CompareEndpoints(TextPatternRangeEndpoint.End, range, TextPatternRangeEndpoint.End) > 0) part.MoveEndpointByRange(TextPatternRangeEndpoint.End, range, TextPatternRangeEndpoint.End);
                string value = part.GetText(80000); if (value.Length == 0) break;
                object weight = part.GetAttributeValue(TextPattern.FontWeightAttribute);
                object italic = part.GetAttributeValue(TextPattern.IsItalicAttribute);
                object font = part.GetAttributeValue(TextPattern.FontNameAttribute);
                bool bold = weight is int && (int)weight >= 600;
                bool emphasis = italic is bool && (bool)italic;
                bool code = font is string && Regex.IsMatch((string)font, @"(mono|consolas|courier|cascadia)", RegexOptions.IgnoreCase);
                result.Append(MarkdownFormat(value, bold, emphasis, code));
                remaining.MoveEndpointByRange(TextPatternRangeEndpoint.Start, part, TextPatternRangeEndpoint.End);
            }
            if (remaining.CompareEndpoints(TextPatternRangeEndpoint.Start, range, TextPatternRangeEndpoint.End) < 0) result.Append(remaining.GetText(80000));
            return result.ToString();
        } catch { return range.GetText(80000); }
    }
    static string MarkdownFormat(string value, bool bold, bool italic, bool code) {
        var match = Regex.Match(value, @"^(\s*)([\s\S]*?)(\s*)$");
        string core = match.Groups[2].Value;
        if (core.Length == 0 || core.Contains("\n") || core.Contains("\r")) return value;
        if (code) core = (core.Contains("`") ? "``" : "`") + core + (core.Contains("`") ? "``" : "`");
        if (bold) core = "**" + core + "**";
        if (italic) core = "*" + core + "*";
        return match.Groups[1].Value + core + match.Groups[3].Value;
    }
    static string MarkdownList(TextPattern text, AutomationElement list) {
        var items = Children(list, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
        if (items.Length == 0) return null;
        var lines = new List<string>();
        foreach (var item in items) {
            string value = Regex.Replace(MarkdownRange(text.RangeFromChild(item)).Trim(), @"(?m)^\s*[•●▪-]\s*", "");
            if (value.Length > 0) lines.Add("- " + value.Replace("\r\n", "\n").Replace("\n", "\n  "));
        }
        return lines.Count == 0 ? null : "\n" + String.Join("\n", lines.ToArray()) + "\n";
    }
    static string MarkdownTable(TextPattern text, AutomationElement table) {
        object gridObject; if (!table.TryGetCurrentPattern(GridPattern.Pattern, out gridObject)) return null;
        var grid = (GridPattern)gridObject; int rows = grid.Current.RowCount, columns = grid.Current.ColumnCount;
        if (rows < 1 || columns < 2 || rows > 100 || columns > 20) return null;
        var cells = new string[rows, columns];
        foreach (var cell in Children(table, Condition.TrueCondition)) {
            object itemObject; if (!cell.TryGetCurrentPattern(GridItemPattern.Pattern, out itemObject)) continue;
            var item = (GridItemPattern)itemObject; int row = item.Current.Row, column = item.Current.Column;
            if (row >= rows || column >= columns) continue;
            string value = MarkdownRange(text.RangeFromChild(cell)).Trim();
            cells[row, column] = Regex.Replace(value, @"\s*\r?\n\s*", " ").Replace("|", "\\|");
        }
        var output = new StringBuilder("\n");
        for (int row = 0; row < rows; row++) {
            output.Append("| "); for (int column = 0; column < columns; column++) output.Append((cells[row, column] ?? "") + " | "); output.Append("\n");
            if (row == 0) { output.Append("| "); for (int column = 0; column < columns; column++) output.Append("--- | "); output.Append("\n"); }
        }
        return output.ToString();
    }
    internal class RangeReplacement {
        internal TextPatternRange range; internal string markdown;
        internal RangeReplacement(TextPatternRange range, string markdown) { this.range = range; this.markdown = markdown; }
    }
    static object InspectTurnMarkers() {
        return ReadStable(() => {
            var doc = Verify();
            return Children(doc, Condition.TrueCondition).Where(e => Regex.IsMatch(Name(e), @"^(Message actions|Response actions|내 메시지 작업|응답 작업|You said:?|ChatGPT said:?|나의 말:?|ChatGPT의 말:?)$", RegexOptions.IgnoreCase)).Take(20)
                .Select(e => {
                    var raw = TreeWalker.RawViewWalker.GetParent(e); var control = TreeWalker.ControlViewWalker.GetParent(e);
                    return new { marker = Name(e), type = e.Current.ControlType.ProgrammaticName,
                        rawId = raw == null ? "" : Runtime(raw), controlId = control == null ? "" : Runtime(control),
                        rawType = raw == null ? "" : raw.Current.ControlType.ProgrammaticName,
                        rawName = raw == null ? "" : Name(raw), rangeText = raw == null ? null : GroupRangeText(doc, raw),
                        rawPreview = raw == null ? "" : String.Join("|", Children(raw, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text)).Take(3).Select(Name).ToArray()) };
                }).ToArray();
        });
    }
    static object InspectLatestTree() {
        return ReadStable(() => {
            var doc = Verify(); var markers = Children(doc, Condition.TrueCondition)
                .Where(e => Regex.IsMatch(Name(e).Trim(), @"^(Response actions|응답 작업)$", RegexOptions.IgnoreCase)).ToArray();
            if (markers.Length == 0) return new object[0];
            var group = TreeWalker.RawViewWalker.GetParent(markers[markers.Length - 1]);
            object pattern; if (!doc.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return new object[0]; var text = (TextPattern)pattern;
            return Children(group, Condition.TrueCondition).Take(300).Select(e => {
                object weight = null, italic = null, font = null;
                try { var range = text.RangeFromChild(e); weight = range.GetAttributeValue(TextPattern.FontWeightAttribute); italic = range.GetAttributeValue(TextPattern.IsItalicAttribute); font = range.GetAttributeValue(TextPattern.FontNameAttribute); } catch {}
                return new { type = e.Current.ControlType.ProgrammaticName, name = Name(e), id = e.Current.AutomationId,
                    className = e.Current.ClassName, localizedType = e.Current.LocalizedControlType, weight = weight, italic = italic, font = font };
            }).ToArray();
        });
    }
    static string GroupRangeText(AutomationElement doc, AutomationElement group) {
        object pattern;
        if (!doc.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return null;
        return ((TextPattern)pattern).RangeFromChild(group).GetText(80000);
    }
    static object Scan(string targetConversation) {
        var ids = new HashSet<int>(Process.GetProcesses().Where(p => SupportedHost(p.ProcessName)).Select(p => p.Id));
        var wins = AutomationElement.RootElement.FindAll(TreeScope.Children, Condition.TrueCondition).Cast<AutomationElement>();
        var candidates = new List<object>();
        foreach (var win in wins) {
            try {
                if (!ids.Contains(win.Current.ProcessId)) continue;
                bool supported = false; string reason = "", conversation = null, title = Name(win);
                try {
                    var doc = Document(win, targetConversation);
                    conversation = ChatUrl.Match(ConversationUrl(win, doc)).Groups[1].Value;
                    if (targetConversation != null && !String.Equals(conversation, targetConversation, StringComparison.OrdinalIgnoreCase)) continue;
                    if (targetConversation == null && !MatchesTitle(win, doc)) throw new Exception("지정한 '코덱스 연결' 대화의 제목을 확인하지 못했어요. 해당 대화를 열어 주세요.");
                    if (String.Equals(Process.GetProcessById(win.Current.ProcessId).ProcessName, "chrome", StringComparison.OrdinalIgnoreCase)) title = (String.IsNullOrWhiteSpace(Name(doc)) ? "ChatGPT 대화" : Name(doc)) + " · Chrome";
                    Input(doc); supported = Turns(doc).Count > 0;
                    if (!supported) reason = "대화 내용을 접근성 기능으로 구분할 수 없어요. 기존 메시지가 있는 대화를 열어 주세요.";
                }
                catch (Exception ex) { reason = ex.Message; }
                if (targetConversation != null && conversation == null) continue;
                candidates.Add(new { windowId = win.Current.NativeWindowHandle, title = title, conversationId = conversation, supported = supported, reason = reason });
            } catch (ElementNotAvailableException) {}
        }
        return candidates;
    }
    static object Connect(int handle, string targetConversation) {
        if (pendingText != null) throw new Exception("이전 응답을 확인하기 전에는 연결 대화를 바꿀 수 없어요.");
        var win = AutomationElement.FromHandle(new IntPtr(handle));
        if (!SupportedHost(Process.GetProcessById(win.Current.ProcessId).ProcessName)) throw new Exception("ChatGPT 앱 또는 Chrome 창만 연결할 수 있어요.");
        var doc = Document(win, targetConversation); Input(doc);
        var conversation = ChatUrl.Match(ConversationUrl(win, doc)).Groups[1].Value;
        if (targetConversation != null && !String.Equals(conversation, targetConversation, StringComparison.OrdinalIgnoreCase)) throw new Exception("Chrome에 열린 대화가 설정한 대화 주소와 달라 연결을 중단했어요.");
        if (targetConversation == null && !MatchesTitle(win, doc)) throw new Exception("지정한 '코덱스 연결' 대화만 연결할 수 있어요.");
        if (Turns(doc).Count == 0) throw new Exception("대화의 메시지 구조를 확인할 수 없어 연결을 중단했습니다.");
        boundWindow = win; boundPid = win.Current.ProcessId; boundHandle = handle;
        boundConversation = conversation;
        boundTitle = String.Equals(Process.GetProcessById(win.Current.ProcessId).ProcessName, "chrome", StringComparison.OrdinalIgnoreCase)
            ? (String.IsNullOrWhiteSpace(Name(doc)) ? "ChatGPT 대화" : Name(doc)) + " · Chrome"
            : Name(win);
        return Status();
    }
    static AutomationElement Verify() {
        return VerifyCore();
    }
    static bool TransientRead(Exception ex) {
        return ex is ElementNotAvailableException || ex is COMException || (ex is ArgumentException && ((ArgumentException)ex).ParamName == "value");
    }
    static bool RetryableRead(Exception ex) { return ex is AccessPending || TransientRead(ex); }
    static string AvailabilityMessage() {
        return boundHandle != 0 && IsIconic(new IntPtr(boundHandle))
            ? "Chrome이 최소화되어 대화를 읽을 수 없어요. 창을 복원하면 같은 대화를 다시 확인합니다."
            : "ChatGPT 대화를 다시 확인하는 중이에요. 연결한 대화 탭을 열어 두세요.";
    }
    static object InspectWindow() {
        uint pid = 0; var handle = new IntPtr(boundHandle);
        bool exists = boundHandle != 0 && IsWindow(handle);
        if (exists) GetWindowThreadProcessId(handle, out pid);
        return new { windowId = boundHandle, exists = exists, sameProcess = exists && pid == boundPid,
            minimized = exists && IsIconic(handle), pending = pendingText != null, conversationId = boundConversation };
    }
    internal class AccessPending : Exception {
        internal AccessPending() : base("지정한 ChatGPT 대화의 접근성 정보를 현재 읽을 수 없어요.") {}
    }
    static T ReadStable<T>(Func<T> read) {
        var timer = Stopwatch.StartNew();
        while (true) {
            try { return read(); }
            catch (Exception ex) { if (!TransientRead(ex) || timer.ElapsedMilliseconds >= 1500) throw; }
            Thread.Sleep(100);
        }
    }
    static T ReadPreflight<T>(Func<T> read) {
        // A provider can briefly return an old composer value without throwing
        // a stale-element exception. Confirm a nonempty observation with fresh
        // document/input objects before rejecting it. These callbacks only read;
        // SetValue and Invoke stay outside this retry loop and run at most once.
        for (int attempt = 0; ; attempt++) {
            try { return ReadStable(read); }
            catch (SendFailure ex) {
                if (ex.Code != "COMPOSER_NOT_EMPTY" || attempt >= 3) throw;
            }
            Thread.Sleep(150);
        }
    }
    static AutomationElement VerifyCore() {
        if (boundHandle == 0) throw new Exception("ChatGPT 대화를 먼저 연결해 주세요.");
        uint currentPid;
        var handle = new IntPtr(boundHandle);
        if (!IsWindow(handle) || GetWindowThreadProcessId(handle, out currentPid) == 0 || currentPid != boundPid) throw new Exception("ChatGPT 창이 종료되어 연결이 끊겼어요.");
        // HWND + process + exact live conversation URL are the binding. UIA
        // runtime IDs and COM wrappers may be recreated after minimize/restore.
        boundWindow = AutomationElement.FromHandle(handle);
        var doc = Document(boundWindow, boundConversation);
        if (!String.Equals(ChatUrl.Match(ConversationUrl(boundWindow, doc)).Groups[1].Value, boundConversation, StringComparison.OrdinalIgnoreCase)) throw new Exception("ChatGPT의 대화가 바뀌어 전송을 중단했어요. 원래 대화를 열고 다시 연결해 주세요.");
        return doc;
    }
    static object Status() {
        var doc = Verify();
        return new { connected = true, conversationId = boundConversation, title = boundTitle, busy = Generating(doc), pending = pendingText != null };
    }
    static object Send(string text) {
        // The JS bridge validates the user's 6000-character limit before adding
        // the short, user-requested character emotion format instruction.
        bool wroteDraft = false, invokeAttempted = false; string stage = "preflight";
        try {
            if (String.IsNullOrWhiteSpace(text) || text.Length > 7000) throw new Exception("전송 메시지의 길이 제한을 초과했습니다.");
            if (pendingText != null) throw new Exception("이전 답변을 기다려 주세요.");
            baseline = ReadPreflight(() => {
                var current = Verify();
                if (Generating(current)) throw new Exception("ChatGPT가 다른 답변을 작성 중이에요.");
                RequireEmpty(Input(current), current);
                return Turns(current);
            });
            if (baseline.Count == 0) throw new Exception("대화 내용을 확인할 수 없어 전송을 중단했습니다.");
            // Re-read after collecting the transcript so a newly typed draft
            // cannot be overwritten based on an older empty observation.
            var input = ReadPreflight(() => { var current = Verify(); var editor = Input(current); RequireEmpty(editor, current); return editor; });
            wroteDraft = true;
            stage = "set-value";
            // Chromium can commit an accessibility edit and then return a COM
            // error as the editor rerenders. Read back the result; never type twice.
            try { Value(input).SetValue(text); } catch (Exception) { /* The verified readback below decides whether the edit committed. */ }
            stage = "verify-input";
            var submit = WaitForPreparedInput(text);
            stage = "resolve-submit";
            var invoke = (InvokePattern)submit.GetCurrentPattern(InvokePattern.Pattern);
            pendingText = text; lastAnswer = null; answerStable = null;
            // Any failure after this point is ambiguous and must never retry.
            invokeAttempted = true;
            stage = "invoke";
            invoke.Invoke();
            return new { sent = true };
        } catch (Exception ex) {
            bool retained = false;
            if (!invokeAttempted && wroteDraft) retained = !RestoreOwnDraft(text);
            if (!invokeAttempted && pendingText == null) baseline = null;
            var failure = ex as SendFailure;
            string message = String.IsNullOrWhiteSpace(ex.Message) ? "ChatGPT 접근성 작업이 실패했어요 (" + stage + ", " + ex.GetType().Name + ", 0x" + ex.HResult.ToString("X8") + ")." : ex.Message;
            if (retained) message += " ChatGPT에 Mate가 입력한 문장이 남아 있을 수 있으니 확인해 주세요.";
            bool retryable = !invokeAttempted && !retained && RetryableRead(ex);
            var wrapped = new SendFailure(failure == null ? (invokeAttempted ? "SEND_OUTCOME_UNKNOWN" : "NOT_SENT") : failure.Code, message, !invokeAttempted, retryable);
            wrapped.Data["diagnostic"] = ex.Data["diagnostic"];
            throw wrapped;
        }
    }
    static ComposerSnapshot ReadComposer(AutomationElement input, AutomationElement doc) {
        object pattern;
        bool hasText = input.TryGetCurrentPattern(TextPattern.Pattern, out pattern);
        var snapshot = new ComposerSnapshot {
            Value = Value(input).Current.Value,
            Text = hasText ? ((TextPattern)pattern).DocumentRange.GetText(8000) : null,
            HasText = hasText, Name = Name(input), Help = input.Current.HelpText ?? ""
        };
        // Only consult composer buttons when both text sources contain a hint.
        if (ComposerGuard.Placeholder(snapshot.Value)) {
            snapshot.HasSubmit = SubmitCandidates(doc).Length > 0;
            snapshot.VoiceReady = Children(doc, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))
                .Any(e => e.Current.IsEnabled && Regex.IsMatch(Name(e), @"^(Voice 시작|Start voice mode|Use voice mode|음성 모드 시작|음성 대화 시작)$", RegexOptions.IgnoreCase));
        }
        snapshot.RenderedPlaceholder = ComposerGuard.RenderedPlaceholder(snapshot.Value, snapshot.Text, hasText, input.Current.AutomationId, snapshot.Name, snapshot.VoiceReady, snapshot.HasSubmit);
        return snapshot;
    }
    static object InspectComposer() {
        var doc = Verify(); var input = Input(doc); var snapshot = ReadComposer(input, doc);
        return new {
            conversationId = boundConversation, snapshot = snapshot,
            inputType = input.Current.ControlType.ProgrammaticName, inputId = input.Current.AutomationId,
            empty = ComposerEmpty(snapshot),
            children = Children(input, Condition.TrueCondition).Take(16).Select(e => new {
                type = e.Current.ControlType.ProgrammaticName, id = e.Current.AutomationId,
                name = Name(e), help = e.Current.HelpText, className = e.Current.ClassName,
                value = Value(e) == null ? null : Value(e).Current.Value
            }).ToArray()
        };
    }
    static bool ComposerEmpty(ComposerSnapshot snapshot) {
        return snapshot.RenderedPlaceholder || ComposerGuard.Empty(snapshot.Value, snapshot.Text, snapshot.HasText, snapshot.Name, snapshot.Help);
    }
    static void RequireEmpty(AutomationElement input, AutomationElement doc) {
        var snapshot = ReadComposer(input, doc);
        if (!ComposerEmpty(snapshot)) {
            string message = snapshot.HasText && ComposerGuard.Blank(snapshot.Text)
                ? "ChatGPT의 빈 입력창 상태를 확인하지 못했어요. 해당 탭을 새로고침한 뒤 다시 연결해 주세요. 메시지는 전송되지 않았습니다."
                : "ChatGPT 입력창의 초안을 보호하기 위해 보내지 않았어요. 초안을 직접 전송하거나 비운 뒤 Mate에서 다시 보내 주세요.";
            var failure = new SendFailure("COMPOSER_NOT_EMPTY", message, true);
            // Diagnose provider transitions without copying a user's draft.
            failure.Data["diagnostic"] = new {
                valueLength = (snapshot.Value ?? "").Length, textLength = (snapshot.Text ?? "").Length,
                valuePlaceholder = ComposerGuard.Placeholder(snapshot.Value), textPlaceholder = ComposerGuard.Placeholder(snapshot.Text),
                valueBlank = ComposerGuard.Blank(snapshot.Value), textBlank = ComposerGuard.Blank(snapshot.Text),
                sourcesAgree = ComposerGuard.Same(snapshot.Value, snapshot.Text),
                snapshot.HasText, snapshot.VoiceReady, snapshot.HasSubmit, snapshot.RenderedPlaceholder
            };
            throw failure;
        }
    }
    static AutomationElement WaitForPreparedInput(string text) {
        var timer = Stopwatch.StartNew();
        while (true) {
            try {
                var doc = Verify();
                if (Generating(doc)) throw new Exception("ChatGPT가 답변을 작성 중이라 새 메시지를 전송하지 않았어요.");
                var snapshot = ReadComposer(Input(doc), doc);
                if (ComposerGuard.Matches(snapshot.Value, snapshot.Text, snapshot.HasText, text)) {
                    try { return Submit(doc); }
                    catch (Exception) { if (timer.ElapsedMilliseconds >= 1800) throw; }
                } else if (timer.ElapsedMilliseconds >= 1800) {
                    throw new Exception("입력 내용이 일치하지 않아 전송하지 않았어요.");
                }
            } catch (Exception ex) { if (!TransientRead(ex) || timer.ElapsedMilliseconds >= 1800) throw; }
            Thread.Sleep(100);
        }
    }
    static bool RestoreOwnDraft(string text) {
        // Only roll back text this call inserted, before any Invoke attempt,
        // while the same conversation and transcript are still present.
        try {
            var doc = Verify();
            if (Generating(doc)) return false;
            var turns = Turns(doc);
            if (baseline == null || turns.Count != baseline.Count || baseline.Where((old, i) => old.role != turns[i].role || old.identity != turns[i].identity).Any()) return false;
            var input = Input(doc); var snapshot = ReadComposer(input, doc);
            if (ComposerEmpty(snapshot)) return true;
            if (!ComposerGuard.Matches(snapshot.Value, snapshot.Text, snapshot.HasText, text)) return false;
            try { Value(input).SetValue(""); } catch { /* Read back before deciding whether clearing failed. */ }
            Thread.Sleep(100);
            snapshot = ReadStable(() => { var current = Verify(); return ReadComposer(Input(current), current); });
            return ComposerEmpty(snapshot);
        } catch { return false; }
    }
    static object ClearMatchingDraft(string expected) {
        // Maintenance/test operation: exact text and conversation must match.
        // It is deliberately not exposed in the renderer IPC or auto-retry path.
        if (String.IsNullOrWhiteSpace(expected)) throw new Exception("정리할 문장의 정확한 내용이 필요합니다.");
        var doc = Verify(); if (pendingText != null || Generating(doc)) throw new Exception("전송/수신 중에는 입력창을 정리할 수 없습니다.");
        var input = Input(doc); var snapshot = ReadComposer(input, doc);
        if (!ComposerGuard.Matches(snapshot.Value, snapshot.Text, snapshot.HasText, expected)) throw new Exception("입력창의 내용이 달라 정리하지 않았습니다.");
        try { Value(input).SetValue(""); } catch { /* Some providers report failure after applying the value. */ }
        Thread.Sleep(150); snapshot = ReadStable(() => { var current = Verify(); return ReadComposer(Input(current), current); });
        if (!ComposerEmpty(snapshot)) throw new Exception("입력창 정리 결과를 확인하지 못했습니다.");
        return new { cleared = true };
    }
    internal class ComposerSnapshot { public string Value, Text, Name, Help; public bool HasText, VoiceReady, HasSubmit, RenderedPlaceholder; }
    internal class SendFailure : Exception {
        internal readonly string Code; internal readonly bool NotSent, Retryable;
        internal SendFailure(string code, string message, bool notSent, bool retryable = false) : base(message) { Code = code; NotSent = notSent; Retryable = retryable; }
    }
    static object Poll() {
        var doc = Verify();
        if (pendingText == null) throw new Exception("기다리는 응답이 없어요.");
        var turns = Turns(doc);
        int boundary = TranscriptGuard.Boundary(baseline.Select(t => t.role + "\0" + Normalize(t.identity)).ToArray(), turns.Select(t => t.role + "\0" + Normalize(t.identity)).ToArray());
        if (boundary < 0) throw new Exception("최근 대화의 연결 지점을 확인하지 못해 답변 수신을 중단했어요. 자동 재전송하지 않습니다.");
        var added = turns.Skip(boundary).ToArray();
        if (added.Length > 0 && (added[0].role != "user" || Normalize(added[0].identity) != Normalize(pendingText))) throw new Exception("보낸 메시지와 ChatGPT의 새 메시지가 일치하지 않아요. 자동 재전송하지 않습니다.");
        bool generating = Generating(doc);
        var answer = added.Skip(1).FirstOrDefault(t => t.role == "assistant");
        if (answer != null && answer.content != lastAnswer) { lastAnswer = answer.content; answerStable = Stopwatch.StartNew(); }
        bool complete = answer != null && TranscriptGuard.Complete(generating, added.Length > 0, answer.finalActions, answer.content, answerStable == null ? 0 : answerStable.ElapsedMilliseconds);
        if (complete) { pendingText = null; baseline = null; }
        return new { complete = complete, text = answer == null ? "" : answer.content, acknowledged = added.Length > 0, generating = generating };
    }
    static string Normalize(string s) { return Regex.Replace(s.Trim(), @"\s+", " "); }
    static void Clear() { boundWindow = null; boundHandle = 0; boundConversation = null; boundTitle = null; baseline = null; pendingText = null; lastAnswer = null; answerStable = null; }
    internal class Turn { public string role; public string content; public string identity; public bool finalActions; }
}
