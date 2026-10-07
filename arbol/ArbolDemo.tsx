/**
 * Ejemplo de uso: el árbol a pantalla completa y unos controles de prueba.
 * En el proyecto real, los métodos del controlador se llamarían desde la
 * lógica del juego (por ejemplo, tree.grow() al responder una pregunta).
 */
import type { CSSProperties } from "react";
import { ArbolSVG, STAGE_NAMES, useTreeController, useTreeState } from "./index";

const btn: CSSProperties = { background: "none", border: 0, borderBottom: "1.5px solid rgba(20,18,16,.3)", padding: "6px 2px", font: "inherit", cursor: "pointer" };

export default function ArbolDemo() {
  const tree = useTreeController({ seed: 7 });
  const state = useTreeState(tree);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f5f1e8", color: "#141210", fontFamily: "Georgia, serif" }}>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <ArbolSVG controller={tree} />
        <div style={{ position: "absolute", top: 14, left: 18, pointerEvents: "none" }}>
          <div style={{ fontSize: 28 }}>{state.stage}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>decisión {state.step} de {state.totalSteps}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", justifyContent: "center", padding: 12, borderTop: "1px solid rgba(20,18,16,.18)" }}>
        <button style={btn} onClick={tree.reset}>reiniciar</button>
        <button style={btn} onClick={tree.back} disabled={!state.canGoBack}>− paso</button>
        <button style={btn} onClick={tree.grow} disabled={!state.canGrow}>crecer</button>
        <button style={btn} onClick={tree.dry} disabled={state.dry}>secar</button>
        <select value={state.stageIndex} onChange={(e) => tree.goState(Number(e.target.value))} style={btn}>
          {STAGE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
        <button style={btn} onClick={() => tree.setCameraMode(state.cameraMode === "follow" ? "full" : "follow")}>
          cámara: {state.cameraMode === "follow" ? "seguir" : "completa"}
        </button>
        <button style={btn} onClick={() => tree.setLayout(state.layout === "center" ? "right" : state.layout === "right" ? "left" : "center")}>
          posición: {state.layout === "center" ? "centro" : state.layout === "right" ? "derecha" : "izquierda"}
        </button>
        <button style={btn} onClick={() => tree.setSeed()}>semilla {state.seed}</button>
      </div>
    </div>
  );
}
