/* eslint-disable @typescript-eslint/no-explicit-any */
import ClipperLib from "clipper-lib";
// Ajuste dos caminhos relativos (subindo 2 níveis para sair de postProcessador/cam)
import type { PlacedPart } from "../../utils/nestingCore"; 
import type { ImportedPart } from "../../components/types";

// Configurações da Máquina
export interface MachineConfig {
  kerf: number;      // Diâmetro do feixe (compensação total = kerf / 2)
  feedRate: number;  // Velocidade mm/min
  power: number;     // Potência 0-100% (ou S-value)
  safeHeight: number;// Altura segura para movimentos rápidos (G0)
}

export class GCodeGenerator {
  // Clipper trabalha com inteiros. Usamos fator 1000 para manter precisão de 0.001mm
  private scale = 1000; 

  // ========================================================================
  // 1. LÓGICA DE GEOMETRIA
  // ========================================================================
  
  private flattenGeometry(
    entities: any[],
    blocks: any = {},
    transform = { x: 0, y: 0, rot: 0 }
  ): any[] {
    let flat: any[] = [];
    
    entities.forEach((ent) => {
      if (ent.isLabel) return; 

      if (ent.type === "INSERT") {
        const block = blocks[ent.name];
        if (block && block.entities) {
          const bPos = ent.position || { x: 0, y: 0 };
          const bRot = ent.rotation || 0;
          
          const rad = (transform.rot * Math.PI) / 180;
          const rx = Math.cos(rad) * bPos.x - Math.sin(rad) * bPos.y;
          const ry = Math.sin(rad) * bPos.x + Math.cos(rad) * bPos.y;

          const newTransform = {
            x: transform.x + rx,
            y: transform.y + ry,
            rot: transform.rot + bRot,
          };

          flat = flat.concat(this.flattenGeometry(block.entities, blocks, newTransform));
        }
      } else {
        const clone = JSON.parse(JSON.stringify(ent));
        const rad = (transform.rot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const apply = (px: number, py: number) => {
          const rx = cos * px - sin * py;
          const ry = sin * px + cos * py;
          return {
            x: transform.x + rx,
            y: transform.y + ry,
          };
        };

        if (clone.vertices) {
          clone.vertices = clone.vertices.map((v: any) => {
            const p = apply(v.x, v.y);
            return { ...v, x: p.x, y: p.y };
          });
        } else if (clone.center) {
          const p = apply(clone.center.x, clone.center.y);
          clone.center = { x: p.x, y: p.y };
          if (clone.type === "ARC") {
            clone.startAngle += rad;
            clone.endAngle += rad;
          }
        }
        flat.push(clone);
      }
    });
    return flat;
  }

  // ========================================================================
  // 2. CONVERSÃO PARA CLIPPER
  // ========================================================================

  private entitiesToClipperPaths(entities: any[]): ClipperLib.Path[] {
    const paths: ClipperLib.Path[] = [];

    entities.forEach(ent => {
      const path: ClipperLib.IntPoint[] = [];

      if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
        ent.vertices.forEach((v: any) => {
          path.push({ X: Math.round(v.x * this.scale), Y: Math.round(v.y * this.scale) });
        });
        paths.push(path);
      }
      else if (ent.type === "LINE") {
          path.push({ X: Math.round(ent.vertices[0].x * this.scale), Y: Math.round(ent.vertices[0].y * this.scale) });
          path.push({ X: Math.round(ent.vertices[1].x * this.scale), Y: Math.round(ent.vertices[1].y * this.scale) });
      }
      else if (ent.type === "CIRCLE") {
        const steps = 32; 
        for (let i = 0; i < steps; i++) {
            const theta = (i / steps) * 2 * Math.PI;
            const x = ent.center.x + ent.radius * Math.cos(theta);
            const y = ent.center.y + ent.radius * Math.sin(theta);
            path.push({ X: Math.round(x * this.scale), Y: Math.round(y * this.scale) });
        }
        paths.push(path);
      }
    });

    return paths;
  }

  // ========================================================================
  // 3. FUNÇÃO PRINCIPAL: GERAR G-CODE
  // ========================================================================

  public generate(
    placedParts: PlacedPart[], 
    allParts: ImportedPart[], 
    config: MachineConfig
  ): string {
    
    let allPaths: ClipperLib.Path[] = [];

    placedParts.forEach(placed => {
        const originalPart = allParts.find(p => p.id === placed.partId);
        if(!originalPart) return;

        const flatEntities = this.flattenGeometry(
            originalPart.entities,
            originalPart.blocks,
            { x: placed.x, y: placed.y, rot: placed.rotation }
        );

        const partPaths = this.entitiesToClipperPaths(flatEntities);
        allPaths = allPaths.concat(partPaths);
    });

    // Simplificação e Offset
    allPaths = ClipperLib.Clipper.SimplifyPolygons(allPaths, ClipperLib.PolyFillType.pftNonZero);

    const co = new ClipperLib.ClipperOffset();
    const offsetDelta = (config.kerf / 2) * this.scale;

    co.AddPaths(allPaths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);

    // Tipagem explícita aqui para evitar erros
    const solutionPaths: ClipperLib.Paths = []; 
    
    co.Execute(solutionPaths, offsetDelta);

    // Gerar Texto
    let gcode = `%\n`;
    gcode += `(Gerado por NestingApp MVP)\n`;
    gcode += `G21 (Milimetros)\n`;
    gcode += `G90 (Absoluto)\n`;
    gcode += `F${config.feedRate}\n`;
    gcode += `G0 Z${config.safeHeight}\n\n`;

    // Tipagem explícita no loop
    solutionPaths.forEach((path: ClipperLib.Path) => {
        if (path.length === 0) return;

        const start = path[0];
        gcode += `G0 X${(start.X / this.scale).toFixed(3)} Y${(start.Y / this.scale).toFixed(3)}\n`;
        gcode += `M3 S${config.power} (Laser On)\n`;

        for (let i = 1; i < path.length; i++) {
            const p = path[i];
            gcode += `G1 X${(p.X / this.scale).toFixed(3)} Y${(p.Y / this.scale).toFixed(3)}\n`;
        }

        gcode += `G1 X${(start.X / this.scale).toFixed(3)} Y${(start.Y / this.scale).toFixed(3)}\n`;
        gcode += `M5 (Laser Off)\n`;
        gcode += `G0 Z${config.safeHeight}\n\n`;
    });

    gcode += `M30 (Fim)\n%`;

    return gcode;
  }
}