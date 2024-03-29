
import * as React from 'react';


interface PieChartProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  tooltip?: boolean;
  datasets?: {value: number color?: string; label?: string}[];;
  formatTooltip?: (data: {index: number value: number; label: string; color: string; percentage: number}) => void;;
  onSelect ?: (index: number | null item: {value: number; label: string; color: string}) => void;
}
declare const PieChart: React.FunctionComponent<PieChartProps>;

export default PieChart;
  