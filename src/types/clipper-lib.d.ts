// ARQUIVO: src/types/clipper-lib.d.ts
declare module 'clipper-lib' {
    export interface IntPoint {
        X: number;
        Y: number;
    }

    export type Path = IntPoint[];
    export type Paths = Path[];

    export enum ClipType { ctIntersection, ctUnion, ctDifference, ctXor }
    export enum PolyType { ptSubject, ptClip }
    export enum PolyFillType { pftEvenOdd, pftNonZero, pftPositive, pftNegative }
    export enum JoinType { jtSquare, jtRound, jtMiter }
    export enum EndType { etOpenSquare, etOpenRound, etOpenButt, etClosedLine, etClosedPolygon }

    export class Clipper {
        static SimplifyPolygons(paths: Paths, fillType?: PolyFillType): Paths;
    }

    export class ClipperOffset {
        constructor(miterLimit?: number, arcTolerance?: number);
        AddPath(path: Path, joinType: JoinType, endType: EndType): void;
        AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
        Execute(solution: Paths, delta: number): void;
        Clear(): void;
    }
}