/**
 * Monta el árbol en cualquier contenedor del DOM, sin React.
 * Hace exactamente lo que ArbolSVG.tsx (misma estructura y mismo CSS) y
 * conecta el TreeController. Los archivos originales no se tocan.
 */
import { TreeController, TREE_CLASS } from "./TreeController";
export { TreeController } from "./TreeController";
export { TOTAL_STEPS } from "./model";

/* Idéntico al de ArbolSVG.tsx */
const CSS = `
.arbol-svg .${TREE_CLASS.sil}{fill:var(--arbol-ink,#141210);transition:fill 3s ease}
.arbol-svg svg.${TREE_CLASS.dry} .arbol-branches .${TREE_CLASS.sil},
.arbol-svg svg.${TREE_CLASS.dry} .arbol-roots .${TREE_CLASS.sil}{fill:var(--arbol-ink-dry,#6f665c)}
.arbol-svg .${TREE_CLASS.gline}{fill:none;stroke:var(--arbol-ink,#141210);stroke-width:1.4px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.arbol-svg .${TREE_CLASS.soil}{fill:none;stroke:var(--arbol-ink,#141210);stroke-width:1px;vector-effect:non-scaling-stroke;stroke-linecap:round;opacity:.35}
.arbol-svg .${TREE_CLASS.fall}{transform-box:fill-box;transform-origin:50% 50%}
.arbol-svg .${TREE_CLASS.grow}{transform-box:fill-box;transform-origin:0% 50%;transform:scale(.001) rotate(-35deg);opacity:0}
.arbol-svg .${TREE_CLASS.leaf}{fill:var(--arbol-ink,#141210)}
.arbol-svg .arbol-svg__wrap{position:absolute;inset:0;transition:transform 1.8s cubic-bezier(.45,0,.25,1)}
@media (prefers-reduced-motion: reduce){.arbol-svg .arbol-svg__wrap{transition:none}}
`;

const NS = "http://www.w3.org/2000/svg";

export function mountArbol(host: HTMLElement, controller: TreeController, ariaLabel = "Árbol que crece con las decisiones"): () => void {
  const root = document.createElement("div");
  root.className = "arbol-svg";
  root.style.cssText = "position:relative;overflow:hidden;width:100%;height:100%";
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  const wrap = document.createElement("div");
  wrap.className = "arbol-svg__wrap";
  root.appendChild(wrap);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-40 -44 80 80");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
  svg.style.cssText = "width:100%;height:100%;display:block";
  const mk = (cls?: string) => {
    const g = document.createElementNS(NS, "g");
    if (cls) g.setAttribute("class", cls);
    svg.appendChild(g);
    return g;
  };
  const soil = mk(), roots = mk("arbol-roots"), ground = mk(), branches = mk("arbol-branches"), leaves = mk();
  wrap.appendChild(svg);
  host.appendChild(root);

  controller.attach({ wrap, svg, soil, roots, ground, branches, leaves });
  return () => { controller.detach(); root.remove(); };
}
