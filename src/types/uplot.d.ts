// Type declarations for uPlot

declare module 'uplot' {
  export interface Options {
    width: number;
    height: number;
    series: Series[];
    axes: Axis[];
  }

  export interface Series {
    label?: string;
    show?: boolean;
    stroke?: string;
    width?: number;
  }

  export interface Axis {
    label?: string;
    side?: number;
  }

  export type AlignedData = (number | number[])[];

  export default class uPlot {
    constructor(opts: Options, data: AlignedData, container: HTMLElement);
    destroy(): void;
  }
}

declare module 'uplot/dist/uPlot.min.css';
