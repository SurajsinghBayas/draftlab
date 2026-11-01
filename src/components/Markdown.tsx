import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders model output. react-markdown ignores raw HTML by default, so a draft cannot inject markup. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`doc ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
