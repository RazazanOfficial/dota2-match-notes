import type { ReactNode } from "react";

type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: JsonNode[]; content?: JsonNode[] };

function children(node: JsonNode) {
  return (Array.isArray(node.content) ? node.content : []).map((child, index) => <DocumentNode node={child} key={index} />);
}

function DocumentNode({ node }: { node: JsonNode }): ReactNode {
  if (node.type === "text") {
    let value: ReactNode = node.text || "";
    for (const mark of node.marks || []) {
      if (mark.type === "bold") value = <strong>{value}</strong>;
      if (mark.type === "italic") value = <em>{value}</em>;
      if (mark.type === "strike") value = <s>{value}</s>;
      if (mark.type === "code") value = <code>{value}</code>;
      if (mark.type === "link" && typeof mark.attrs?.href === "string" && /^https?:\/\//.test(mark.attrs.href)) {
        value = <a href={mark.attrs.href} target="_blank" rel="noreferrer">{value}</a>;
      }
    }
    return value;
  }
  if (node.type === "paragraph") return <p>{children(node)}</p>;
  if (node.type === "heading") {
    const level = Number(node.attrs?.level) === 3 ? 3 : 2;
    return level === 3 ? <h3>{children(node)}</h3> : <h2>{children(node)}</h2>;
  }
  if (node.type === "bulletList") return <ul>{children(node)}</ul>;
  if (node.type === "orderedList") return <ol>{children(node)}</ol>;
  if (node.type === "listItem") return <li>{children(node)}</li>;
  if (node.type === "blockquote") return <blockquote>{children(node)}</blockquote>;
  if (node.type === "codeBlock") return <pre><code>{children(node)}</code></pre>;
  if (node.type === "hardBreak") return <br />;
  if (node.type === "horizontalRule") return <hr />;
  return <>{children(node)}</>;
}

export default function TiptapDocument({ document }: { document: Record<string, unknown> }) {
  return <div className="release-rich-text"><DocumentNode node={document as JsonNode} /></div>;
}
