import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { TreeController, TREE_CLASS, type TreeControllerOptions, type TreeState } from "./TreeController";

export interface ArbolSVGProps {
  /** Controlador que maneja el árbol (créalo con useTreeController) */
  controller: TreeController;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/* Estilos del árbol. Los colores se pueden cambiar desde fuera con
   --arbol-ink y --arbol-ink-dry. El fondo es transparente: lo pone la página. */
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

/**
 * Árbol SVG persistente. No se desmonta entre escenas: solo recibe órdenes
 * de su controlador.
 */
export function ArbolSVG({ controller, className, style, ariaLabel = "Árbol que crece con las decisiones" }: ArbolSVGProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const soil = useRef<SVGGElement>(null);
  const roots = useRef<SVGGElement>(null);
  const ground = useRef<SVGGElement>(null);
  const branches = useRef<SVGGElement>(null);
  const leaves = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!wrap.current || !svg.current || !soil.current || !roots.current || !ground.current || !branches.current || !leaves.current) return;
    controller.attach({
      wrap: wrap.current, svg: svg.current, soil: soil.current, roots: roots.current,
      ground: ground.current, branches: branches.current, leaves: leaves.current,
    });
    return () => controller.detach();
  }, [controller]);

  return (
    <div
      className={className ? `arbol-svg ${className}` : "arbol-svg"}
      style={{ position: "relative", overflow: "hidden", width: "100%", height: "100%", ...style }}
    >
      <style>{CSS}</style>
      <div ref={wrap} className="arbol-svg__wrap">
        <svg
          ref={svg}
          viewBox="-40 -44 80 80"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={ariaLabel}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <g ref={soil} />
          <g ref={roots} className="arbol-roots" />
          <g ref={ground} />
          <g ref={branches} className="arbol-branches" />
          <g ref={leaves} />
        </svg>
      </div>
    </div>
  );
}

/** Crea un controlador estable durante toda la vida del componente */
export function useTreeController(options?: TreeControllerOptions): TreeController {
  const [controller] = useState(() => new TreeController(options));
  return controller;
}

/** Estado del árbol, reactivo (se actualiza cuando se llama a sus métodos) */
export function useTreeState(controller: TreeController): TreeState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
