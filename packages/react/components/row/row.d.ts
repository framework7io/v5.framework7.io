
import * as React from 'react';


interface RowProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  noGap ?: boolean;
  tag ?: string;
  resizable ?: boolean;
  resizableFixed ?: boolean;
  resizableAbsolute ?: boolean;
  resizableHandler ?: boolean;
  onClick ?: (event?: any) => void;
  onGridResize ?: (...args: any[]) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Row: React.FunctionComponent<RowProps>;

export default Row;
  