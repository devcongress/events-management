export interface FrozenGeometry {
  kind: "brand" | "navigation" | "heading" | "control" | "row" | "panel";
  left: number;
  top: number;
  width: number;
  height: number;
}

function geometryKind(element: Element): FrozenGeometry['kind'] | null {
  if (element.classList.contains("app-brand-logo")) return "brand";
  if (element.classList.contains("app-primary-nav")) return "navigation";

  switch (element.tagName) {
    case "H1": return "heading";
    case "H2":
    case "BUTTON":
    case "INPUT":
    case "TEXTAREA": return "control";
    case "TR":
    case "ARTICLE": return "row";
    case "TABLE":
    case "NAV": return "panel";
    default: return null;
  }
}

export function captureFrozenGeometry(): FrozenGeometry[] {
  const shell = document.querySelector<HTMLElement>(".app-shell");

  if (!shell || !window.innerWidth || !window.innerHeight) return [];
  const walker = document.createTreeWalker(shell, NodeFilter.SHOW_ELEMENT);
  const result: FrozenGeometry[] = [];
  let visited = 0;
  let node = walker.nextNode();

  while (node && visited < 500 && result.length < 90) {
    visited += 1;
    const element = node as HTMLElement;
    const kind = geometryKind(element);

    if (kind) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      if (rect.width >= 12 && rect.height >= 12 && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0 && style.visibility !== "hidden" && style.display !== "none") {
        result.push({
          kind,
          left: rect.left / window.innerWidth * 100,
          top: rect.top / window.innerHeight * 100,
          width: rect.width / window.innerWidth * 100,
          height: rect.height / window.innerHeight * 100,
        });
      }
    }
    node = walker.nextNode();
  }

  return result;
}
