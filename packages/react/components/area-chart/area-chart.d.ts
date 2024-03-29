
import * as React from 'react';


interface AreaChartProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  lineChart?: boolean;
  datasets?: {values: number[] color?: string; label?: any}[];;
  axis?: boolean;
  axisLabels?: any[];
  tooltip?: boolean;
  legend?: boolean;
  toggleDatasets?: boolean;
  width?: number;
  height?: number;
  maxAxisLabels?: number;
  formatAxisLabel?: (label: any) => string;
  formatLegendLabel?: (label: any) => string;
  formatTooltip?: (data: {index: number total: number; datasets: {label: any; color: string; value: number}[]}) => string;;
  formatTooltipAxisLabel?: (label: any) => string;
  formatTooltipTotal?: (total: number) => string;
  formatTooltipDataset?: (label: any value: number; color: string) => string;;
  onSelect ?: (index: number | null) => void;
}
declare const AreaChart: React.FunctionComponent<AreaChartProps>;

export default AreaChart;
  