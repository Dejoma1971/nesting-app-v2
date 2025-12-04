/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import DxfParser from "dxf-parser";
import type { ImportedPart } from "./types";

// --- ESTRUTURAS AUXILIARES ---
interface Point {
  x: number;
  y: number;
}
interface EntityBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

// --- 1. FUNÇÕES AUXILIARES (MATEMÁTICA E CLUSTERING) ---

class UnionFind {
  parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

const rotatePoint = (x: number, y: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  };
};

const getConnectionPoints = (ent: any): Point[] => {
  if (ent.type === "LINE") return ent.vertices;
  if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") return ent.vertices;
  if (ent.type === "ARC") {
    const r = ent.radius;
    const cx = ent.center.x;
    const cy = ent.center.y;
    const p1 = {
      x: cx + r * Math.cos(ent.startAngle),
      y: cy + r * Math.sin(ent.startAngle),
    };
    const p2 = {
      x: cx + r * Math.cos(ent.endAngle),
      y: cy + r * Math.sin(ent.endAngle),
    };
    return [p1, p2];
  }
  return [];
};

const arePointsClose = (p1: Point, p2: Point) => {
  const TOLERANCE = 1.0;
  return Math.abs(p1.x - p2.x) < TOLERANCE && Math.abs(p1.y - p2.y) < TOLERANCE;
};

const entitiesTouch = (ent1: any, ent2: any) => {
  const pts1 = getConnectionPoints(ent1);
  const pts2 = getConnectionPoints(ent2);
  for (const p1 of pts1) {
    for (const p2 of pts2) {
      if (arePointsClose(p1, p2)) return true;
    }
  }
  return false;
};

const calculateBoundingBox = (entities: any[]): EntityBox => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  entities.forEach((ent) => {
    if (ent.vertices) ent.vertices.forEach((v: any) => update(v.x, v.y));
    else if (ent.center && ent.radius) {
      update(ent.center.x - ent.radius, ent.center.y - ent.radius);
      update(ent.center.x + ent.radius, ent.center.y + ent.radius);
    }
  });
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, area: 0 };
  return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
};

const isContained = (inner: EntityBox, outer: EntityBox) => {
  const eps = 0.5;
  return (
    inner.minX >= outer.minX - eps &&
    inner.maxX <= outer.maxX + eps &&
    inner.minY >= outer.minY - eps &&
    inner.maxY <= outer.maxY + eps
  );
};

const flattenGeometry = (
  entities: any[],
  blocks: any,
  transform = { x: 0, y: 0, rotation: 0, scale: 1 }
): any[] => {
  let flatEntities: any[] = [];
  if (!entities) return [];
  entities.forEach((ent) => {
    if (ent.type === "INSERT") {
      const block = blocks[ent.name];
      if (block && block.entities) {
        const newScale = transform.scale * (ent.scale?.x || 1);
        const newRotation = transform.rotation + (ent.rotation || 0);
        const rPos = rotatePoint(
          ent.position.x,
          ent.position.y,
          transform.rotation
        );
        const newX = transform.x + rPos.x * transform.scale;
        const newY = transform.y + rPos.y * transform.scale;
        flatEntities = flatEntities.concat(
          flattenGeometry(block.entities, blocks, {
            x: newX,
            y: newY,
            rotation: newRotation,
            scale: newScale,
          })
        );
      }
    } else {
      const clone = JSON.parse(JSON.stringify(ent));
      const applyTrans = (x: number, y: number) => {
        const rx = x * transform.scale;
        const ry = y * transform.scale;
        const r = rotatePoint(rx, ry, transform.rotation);
        return { x: r.x + transform.x, y: r.y + transform.y };
      };
      if (clone.type === "LINE") {
        const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y);
        const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y);
        clone.vertices = [
          { x: p1.x, y: p1.y },
          { x: p2.x, y: p2.y },
        ];
        flatEntities.push(clone);
      } else if (clone.type === "LWPOLYLINE" || clone.type === "POLYLINE") {
        if (clone.vertices)
          clone.vertices = clone.vertices.map((v: any) => {
            const p = applyTrans(v.x, v.y);
            return { ...v, x: p.x, y: p.y };
          });
        flatEntities.push(clone);
      } else if (clone.type === "CIRCLE" || clone.type === "ARC") {
        const c = applyTrans(clone.center.x, clone.center.y);
        clone.center = { x: c.x, y: c.y };
        clone.radius *= transform.scale;
        if (clone.type === "ARC") {
          clone.startAngle += (transform.rotation * Math.PI) / 180;
          clone.endAngle += (transform.rotation * Math.PI) / 180;
        }
        flatEntities.push(clone);
      }
    }
  });
  return flatEntities;
};

const applyRotationToPart = (
  part: ImportedPart,
  angle: number
): ImportedPart => {
  const newPart = JSON.parse(JSON.stringify(part));
  const transform = { x: 0, y: 0, rotation: angle, scale: 1 };

  newPart.entities = newPart.entities.map((ent: any) => {
    const applyTrans = (x: number, y: number) =>
      rotatePoint(x, y, transform.rotation);

    if (ent.type === "LINE") {
      const p1 = applyTrans(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = applyTrans(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = applyTrans(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = applyTrans(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
      if (ent.type === "ARC") {
        ent.startAngle += (angle * Math.PI) / 180;
        ent.endAngle += (angle * Math.PI) / 180;
      }
    }
    return ent;
  });

  const box = calculateBoundingBox(newPart.entities);
  const minX = box.minX;
  const minY = box.minY;

  newPart.width = box.maxX - box.minX;
  newPart.height = box.maxY - box.minY;

  newPart.entities.forEach((ent: any) => {
    const move = (x: number, y: number) => ({ x: x - minX, y: y - minY });
    if (ent.vertices)
      ent.vertices = ent.vertices.map((v: any) => {
        const p = move(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    else if (ent.center) {
      const c = move(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
  });

  return newPart;
};

const processFileToParts = (
  flatEntities: any[],
  fileName: string,
  defaults: any
): ImportedPart[] => {
  const n = flatEntities.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (entitiesTouch(flatEntities[i], flatEntities[j])) uf.union(i, j);
    }
  }
  const clusters = new Map<number, any[]>();
  flatEntities.forEach((ent, idx) => {
    const root = uf.find(idx);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(ent);
  });

  const candidateParts = Array.from(clusters.values()).map((ents) => ({
    entities: ents,
    box: calculateBoundingBox(ents),
    children: [] as any[],
    isHole: false,
  }));
  candidateParts.sort((a, b) => b.box.area - a.box.area);

  const finalParts: ImportedPart[] = [];
  for (let i = 0; i < candidateParts.length; i++) {
    const parent = candidateParts[i];
    if (parent.isHole) continue;

    const width = parent.box.maxX - parent.box.minX;
    const height = parent.box.maxY - parent.box.minY;
    if (width < 2 && height < 2) continue;

    for (let j = i + 1; j < candidateParts.length; j++) {
      const child = candidateParts[j];
      if (!child.isHole && isContained(child.box, parent.box)) {
        parent.entities = parent.entities.concat(child.entities);
        child.isHole = true;
      }
    }

    const finalBox = calculateBoundingBox(parent.entities);
    const finalW = finalBox.maxX - finalBox.minX;
    const finalH = finalBox.maxY - finalBox.minY;

    const normalizedEntities = parent.entities.map((ent: any) => {
      const clone = JSON.parse(JSON.stringify(ent));
      const move = (x: number, y: number) => ({
        x: x - finalBox.minX,
        y: y - finalBox.minY,
      });
      if (clone.vertices)
        clone.vertices = clone.vertices.map((v: any) => {
          const p = move(v.x, v.y);
          return { ...v, x: p.x, y: p.y };
        });
      else if (clone.center) {
        const c = move(clone.center.x, clone.center.y);
        clone.center = { x: c.x, y: c.y };
      }
      return clone;
    });

    finalParts.push({
      id: crypto.randomUUID(),
      name: `${fileName} - Item ${finalParts.length + 1}`,
      entities: normalizedEntities,
      blocks: {},
      width: finalW,
      height: finalH,
      grossArea: finalW * finalH,
      netArea: finalW * finalH,
      pedido: defaults.pedido,
      op: defaults.op,
      material: defaults.material,
      espessura: defaults.espessura,
      autor: defaults.autor,
      dataCadastro: new Date().toISOString(),
    });
  }
  return finalParts;
};

// --- 2. COMPONENTE PRINCIPAL ---

export const EngineeringScreen = () => {
  const [parts, setParts] = useState<ImportedPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [viewingPartId, setViewingPartId] = useState<string | null>(null);

  const [batchDefaults, setBatchDefaults] = useState({
    pedido: "",
    op: "",
    material: "Inox 304",
    espessura: 1.0,
    autor: "",
  });

  const handleDefaultChange = (field: string, value: any) => {
    setBatchDefaults((prev) => ({ ...prev, [field]: value }));
  };

  const applyToAll = (field: keyof ImportedPart) => {
    const value = batchDefaults[field as keyof typeof batchDefaults];
    if (value === undefined) return;
    if (
      !window.confirm(
        `Deseja aplicar "${value}" em ${field.toUpperCase()} para TODAS as ${
          parts.length
        } peças?`
      )
    )
      return;
    setParts((prev) => prev.map((p) => ({ ...p, [field]: value })));
  };

  const handleRowChange = (id: string, field: string, value: any) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleDeletePart = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (window.confirm("Deseja realmente remover esta peça do inventário?")) {
      setParts((prev) => prev.filter((p) => p.id !== id));
      if (selectedPartId === id) setSelectedPartId(null);
      if (viewingPartId === id) setViewingPartId(null);
    }
  };

  const handleRotatePart = (direction: "cw" | "ccw") => {
    if (!viewingPartId) return;
    const angle = direction === "cw" ? -90 : 90;

    setParts((prev) =>
      prev.map((p) => {
        if (p.id === viewingPartId) {
          return applyRotationToPart(p, angle);
        }
        return p;
      })
    );
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setProcessingMsg("Lendo arquivo...");

    const parser = new DxfParser();
    const newPartsGlobal: ImportedPart[] = [];

    const readers = Array.from(files).map((file) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            setProcessingMsg(`Processando ${file.name}...`);
            const parsed = parser.parseSync(content);

            if (parsed) {
              const flatEnts = flattenGeometry(
                (parsed as any).entities,
                (parsed as any).blocks
              );
              const partsFromFile = processFileToParts(
                flatEnts,
                file.name,
                batchDefaults
              );
              newPartsGlobal.push(...partsFromFile);
            }
          } catch (err) {
            console.error(err);
          }
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    setParts((prev) => [...prev, ...newPartsGlobal]);
    setLoading(false);
    setProcessingMsg("");
  };

  const renderEntity = (entity: any, index: number): React.ReactNode => {
    switch (entity.type) {
      case "LINE":
        return (
          <line
            key={index}
            x1={entity.vertices[0].x}
            y1={entity.vertices[0].y}
            x2={entity.vertices[1].x}
            y2={entity.vertices[1].y}
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (!entity.vertices) return null;
        const d = entity.vertices
          .map((v: any, i: number) => `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`)
          .join(" ");
        return (
          <path
            key={index}
            d={entity.shape ? d + " Z" : d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      case "CIRCLE":
        return (
          <circle
            key={index}
            cx={entity.center.x}
            cy={entity.center.y}
            r={entity.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      case "ARC": {
        const startAngle = entity.startAngle;
        const endAngle = entity.endAngle;
        const r = entity.radius;
        const x1 = entity.center.x + r * Math.cos(startAngle);
        const y1 = entity.center.y + r * Math.sin(startAngle);
        const x2 = entity.center.x + r * Math.cos(endAngle);
        const y2 = entity.center.y + r * Math.sin(endAngle);
        let da = endAngle - startAngle;
        if (da < 0) da += 2 * Math.PI;
        const largeArc = da > Math.PI ? 1 : 0;
        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
        return (
          <path
            key={index}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      default:
        return null;
    }
  };

  // --- ESTILOS ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#1e1e1e",
    color: "#e0e0e0",
    fontFamily: "Arial",
  };

  const batchContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "15px",
    alignItems: "flex-end",
    padding: "15px",
    background: "#2d2d2d",
    borderBottom: "1px solid #444",
    flexWrap: "wrap",
  };
  const inputGroupStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "#aaa",
    fontWeight: "bold",
  };
  const inputStyle: React.CSSProperties = {
    background: "#1e1e1e",
    border: "1px solid #555",
    color: "#fff",
    padding: "5px",
    borderRadius: "4px",
    fontSize: "13px",
    width: "120px",
  };
  const applyButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "10px",
    marginLeft: "5px",
    textDecoration: "underline",
  };

  const splitContainer: React.CSSProperties = {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  };
  const leftPanel: React.CSSProperties = {
    flex: 1,
    borderRight: "1px solid #444",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    background: "#1e1e1e",
  };
  const rightPanel: React.CSSProperties = {
    flex: 3,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    background: "#1e1e1e",
  };

  const cardStyle: React.CSSProperties = {
    width: "120px",
    height: "120px",
    border: "1px solid #444",
    margin: "10px",
    borderRadius: "4px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#2d2d2d",
    flexDirection: "column",
    cursor: "pointer",
    transition: "0.2s",
    position: "relative",
  };

  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px",
    borderBottom: "1px solid #555",
    color: "#888",
    fontSize: "12px",
    whiteSpace: "nowrap",
  };
  const tableCellStyle: React.CSSProperties = {
    padding: "5px 8px",
    borderBottom: "1px solid #333",
    fontSize: "13px",
  };
  const cellInputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: "inherit",
    borderBottom: "1px solid #444",
  };

  const deleteBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
  };

  // --- PEÇA EM VISUALIZAÇÃO NO MODAL ---
  const viewingPart = viewingPartId
    ? parts.find((p) => p.id === viewingPartId)
    : null;

  return (
    <div style={containerStyle}>
      <div style={batchContainerStyle}>
        {/* ... Inputs de Batch ... */}
        <div
          style={{
            color: "#fff",
            fontWeight: "bold",
            marginRight: "20px",
            fontSize: "14px",
          }}
        >
          PADRÃO DO LOTE:
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            PEDIDO{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("pedido")}
            >
              Aplicar Todos
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.pedido}
            onChange={(e) => handleDefaultChange("pedido", e.target.value)}
            placeholder="Ex: 35041"
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            OP{" "}
            <button style={applyButtonStyle} onClick={() => applyToAll("op")}>
              Aplicar Todos
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.op}
            onChange={(e) => handleDefaultChange("op", e.target.value)}
            placeholder="Ex: 5020"
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            MATERIAL{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("material")}
            >
              Aplicar Todos
            </button>
          </label>
          <select
            style={inputStyle}
            value={batchDefaults.material}
            onChange={(e) => handleDefaultChange("material", e.target.value)}
          >
            <option value="Inox 304">Inox 304</option>
            <option value="Inox 430">Inox 430</option>
            <option value="Aço Carbono">Aço Carbono</option>
            <option value="Galvanizado">Galvanizado</option>
            <option value="Alumínio">Alumínio</option>
          </select>
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            ESPESSURA (mm){" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("espessura")}
            >
              Aplicar Todos
            </button>
          </label>
          <input
            type="number"
            step="0.1"
            style={{ ...inputStyle, width: "80px" }}
            value={batchDefaults.espessura}
            onChange={(e) =>
              handleDefaultChange("espessura", Number(e.target.value))
            }
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            AUTOR{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("autor")}
            >
              Aplicar Todos
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.autor}
            onChange={(e) => handleDefaultChange("autor", e.target.value)}
            placeholder="Ex: Gabriel"
          />
        </div>
        <label
          style={{
            background: "#28a745",
            color: "white",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            marginLeft: "auto",
          }}
        >
          + Importar e Processar
          <input
            type="file"
            accept=".dxf"
            multiple
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      <div style={splitContainer}>
        {/* ESQUERDA: MINIATURAS */}
        <div style={leftPanel}>
          <div
            style={{
              padding: "10px",
              borderBottom: "1px solid #333",
              fontWeight: "bold",
              fontSize: "12px",
              background: "#252526",
            }}
          >
            VISUALIZAÇÃO ({parts.length})
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              padding: "10px",
              alignContent: "flex-start",
            }}
          >
            {parts.map((part, idx) => {
              let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
              part.entities.forEach((ent: any) => {
                if (ent.vertices)
                  ent.vertices.forEach((v: any) => {
                    if (v.x < minX) minX = v.x;
                    if (v.x > maxX) maxX = v.x;
                    if (v.y < minY) minY = v.y;
                    if (v.y > maxY) maxY = v.y;
                  });
                else if (ent.center) {
                  const r = ent.radius || 0;
                  if (ent.center.x - r < minX) minX = ent.center.x - r;
                  if (ent.center.x + r > maxX) maxX = ent.center.x + r;
                  if (ent.center.y - r < minY) minY = ent.center.y - r;
                  if (ent.center.y + r > maxY) maxY = ent.center.y + r;
                }
              });
              const w = maxX - minX || 100;
              const h = maxY - minY || 100;
              const p = Math.max(w, h) * 0.1;
              const viewBox = `${minX - p} ${minY - p} ${w + p * 2} ${
                h + p * 2
              }`;

              const isSelected = part.id === selectedPartId;
              const dynamicCardStyle: React.CSSProperties = {
                ...cardStyle,
                borderColor: isSelected ? "#007bff" : "#444",
                boxShadow: isSelected
                  ? "0 0 0 2px rgba(0,123,255,0.5)"
                  : "none",
                transform: isSelected ? "scale(1.05)" : "scale(1)",
                zIndex: isSelected ? 1 : 0,
              };

              return (
                <div
                  key={part.id}
                  style={dynamicCardStyle}
                  title={part.name}
                  onClick={() => setSelectedPartId(part.id)}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      fontSize: "9px",
                      color: isSelected ? "#007bff" : "#777",
                      fontWeight: "bold",
                    }}
                  >
                    #{idx + 1}
                  </div>

                  {/* AQUI ESTÁ A CORREÇÃO DE LAYOUT: CONTAINER DE BOTÕES EM COLUNA */}
                  <div
                    style={{
                      position: "absolute",
                      top: 5,
                      right: 5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      zIndex: 10, // Garante que fique sobre o card
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingPartId(part.id);
                      }}
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        border: "1px solid #555",
                        color: "#007bff",
                        cursor: "pointer",
                        fontSize: "12px",
                        padding: "4px",
                        borderRadius: "3px",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Visualizar e Rotacionar"
                    >
                      👁️
                    </button>

                    <button
                      onClick={(e) => handleDeletePart(part.id, e)}
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        border: "1px solid #555",
                        color: "#ff4d4d",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "bold",
                        padding: "4px",
                        borderRadius: "3px",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      width: "100%",
                      padding: "5px",
                      boxSizing: "border-box",
                    }}
                  >
                    <svg
                      viewBox={viewBox}
                      style={{ width: "100%", height: "100%" }}
                      transform="scale(1, -1)"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {part.entities.map((ent: any, i: number) =>
                        renderEntity(ent, i)
                      )}
                    </svg>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      background: isSelected ? "#007bff" : "rgba(0,0,0,0.3)",
                      color: isSelected ? "#fff" : "inherit",
                      padding: "2px 5px",
                      fontSize: "9px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "center",
                    }}
                  >
                    {part.width.toFixed(0)}x{part.height.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DIREITA: TABELA EDITÁVEL */}
        <div style={rightPanel}>
          {/* ... Conteúdo inalterado da tabela ... */}
          <div
            style={{
              padding: "10px",
              borderBottom: "1px solid #333",
              fontWeight: "bold",
              fontSize: "12px",
              background: "#252526",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>CADASTRO TÉCNICO</span>
            {loading && (
              <span style={{ color: "#ffd700" }}>⏳ {processingMsg}</span>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                <th style={tableHeaderStyle}>#</th>
                <th style={{ ...tableHeaderStyle, width: "200px" }}>Nome</th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>Pedido</th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>OP</th>
                <th style={tableHeaderStyle}>Material</th>
                <th style={{ ...tableHeaderStyle, width: "60px" }}>Esp.</th>
                <th style={tableHeaderStyle}>Autor</th>
                <th style={tableHeaderStyle}>Dimensões</th>
                <th style={tableHeaderStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part, i) => {
                const isSelected = part.id === selectedPartId;
                const rowBackground = isSelected
                  ? "rgba(0, 123, 255, 0.15)"
                  : i % 2 === 0
                  ? "transparent"
                  : "rgba(255,255,255,0.02)";
                return (
                  <tr
                    key={part.id}
                    style={{ background: rowBackground, cursor: "pointer" }}
                    onClick={() => setSelectedPartId(part.id)}
                  >
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "11px",
                        opacity: 0.5,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.name}
                        onChange={(e) =>
                          handleRowChange(part.id, "name", e.target.value)
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.pedido || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "pedido", e.target.value)
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.op || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "op", e.target.value)
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <select
                        style={{
                          ...cellInputStyle,
                          border: "none",
                          background: "transparent",
                          color: "#aaa",
                        }}
                        value={part.material}
                        onChange={(e) =>
                          handleRowChange(part.id, "material", e.target.value)
                        }
                      >
                        <option value="Inox 304">Inox 304</option>
                        <option value="Inox 430">Inox 430</option>
                        <option value="Aço Carbono">Aço Carbono</option>
                        <option value="Galvanizado">Galvanizado</option>
                        <option value="Alumínio">Alumínio</option>
                      </select>
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        type="number"
                        step="0.1"
                        style={cellInputStyle}
                        value={part.espessura}
                        onChange={(e) =>
                          handleRowChange(
                            part.id,
                            "espessura",
                            Number(e.target.value)
                          )
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.autor || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "autor", e.target.value)
                        }
                      />
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "11px",
                        opacity: 0.7,
                      }}
                    >
                      {part.width.toFixed(0)} x {part.height.toFixed(0)}
                    </td>
                    <td style={tableCellStyle}>
                      <button
                        style={deleteBtnStyle}
                        onClick={(e) => handleDeletePart(part.id, e)}
                        title="Excluir peça"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL DE VISUALIZAÇÃO E ROTAÇÃO --- */}
      {viewingPart && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#252526",
              width: "80%",
              height: "80%",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
            }}
          >
            {/* Cabeçalho do Modal - FIXO */}
            <div
              style={{
                padding: "15px",
                borderBottom: "1px solid #444",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <h3 style={{ margin: 0, color: "#e0e0e0" }}>
                Visualização e Ajuste de Orientação
              </h3>
              <button
                onClick={() => setViewingPartId(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  fontSize: "20px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Corpo do Modal (SVG) - FLEXÍVEL E CONTIDO */}
            <div
              style={{
                flex: 1,
                position: "relative",
                background: "#1e1e1e",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "20px",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {(() => {
                let minX = Infinity,
                  minY = Infinity,
                  maxX = -Infinity,
                  maxY = -Infinity;
                viewingPart.entities.forEach((ent: any) => {
                  if (ent.vertices)
                    ent.vertices.forEach((v: any) => {
                      if (v.x < minX) minX = v.x;
                      if (v.x > maxX) maxX = v.x;
                      if (v.y < minY) minY = v.y;
                      if (v.y > maxY) maxY = v.y;
                    });
                  else if (ent.center) {
                    const r = ent.radius || 0;
                    if (ent.center.x - r < minX) minX = ent.center.x - r;
                    if (ent.center.x + r > maxX) maxX = ent.center.x + r;
                    if (ent.center.y - r < minY) minY = ent.center.y - r;
                    if (ent.center.y + r > maxY) maxY = ent.center.y + r;
                  }
                });
                const w = maxX - minX || 100;
                const h = maxY - minY || 100;
                const p = Math.max(w, h) * 0.2;
                const viewBox = `${minX - p} ${minY - p} ${w + p * 2} ${
                  h + p * 2
                }`;
                return (
                  <svg
                    viewBox={viewBox}
                    style={{
                      width: "100%",
                      height: "100%",
                      maxWidth: "100%",
                      maxHeight: "100%",
                    }}
                    transform="scale(1, -1)"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {viewingPart.entities.map((ent: any, i: number) =>
                      renderEntity(ent, i)
                    )}
                  </svg>
                );
              })()}
            </div>

            {/* Rodapé do Modal - FIXO */}
            <div
              style={{
                padding: "20px",
                borderTop: "1px solid #444",
                display: "flex",
                justifyContent: "center",
                gap: "20px",
                background: "#252526",
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => handleRotatePart("ccw")}
                style={{
                  padding: "10px 20px",
                  background: "#444",
                  color: "#fff",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ↺ Girar Anti-Horário
              </button>
              <button
                onClick={() => handleRotatePart("cw")}
                style={{
                  padding: "10px 20px",
                  background: "#444",
                  color: "#fff",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ↻ Girar Horário
              </button>
              <button
                onClick={() => setViewingPartId(null)}
                style={{
                  padding: "10px 20px",
                  background: "#007bff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginLeft: "20px",
                }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
