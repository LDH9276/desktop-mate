import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ content }: { content: string }) {
  return <div className="message-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children }) => <span className="markdown-link">{children}</span>,
        img: ({ alt }) => <span className="markdown-image">{alt ? `이미지: ${alt}` : '이미지'}</span>,
      }}
    >{content}</ReactMarkdown>
  </div>;
}
