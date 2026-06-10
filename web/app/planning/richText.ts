export function normalizeRichTextHtml(html: string): string {
  const trimmed = (html || "").trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  return trimmed;
}

export function isRichTextEmpty(html: string): boolean {
  return normalizeRichTextHtml(html).length === 0;
}

export function sanitizeRichTextHtml(html: string): string {
  if (typeof document === "undefined") {
    return normalizeRichTextHtml(html);
  }
  const template = document.createElement("template");
  template.innerHTML = html || "";
  template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => {
    node.remove();
  });
  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style") {
        node.removeAttribute(attr.name);
      }
    });
  });
  return normalizeRichTextHtml(template.innerHTML);
}
