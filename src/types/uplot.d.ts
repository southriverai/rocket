// Type declarations for uPlot

declare module 'uplot' {
  export interface Options {
    width: number;
    height: number;
    series: Series[];
    axes: Axis[];
    [key: string]: unknown;
  }

  export interface Series {
    label?: string;
    show?: boolean;
    stroke?: string;
    width?: number;
    [key: string]: unknown;
  }

  export interface Axis {
    label?: string;
    side?: number;
    values?: (u: uPlot, splits: number[]) => string[];
    [key: string]: unknown;
  }

  export type AlignedData = (number | number[])[];

  export default class uPlot {
    constructor(opts: Options, data: AlignedData, container: HTMLElement);
    destroy(): void;
  }
}

declare module 'uplot/dist/uPlot.min.css';
