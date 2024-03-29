
import * as React from 'react';


interface ColProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  tag ?: string;
  width ?: number | string;
  xsmall ?: number | string;
  small ?: number | string;
  medium ?: number | string;
  large ?: number | string;
  xlarge ?: number | string;
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
declare const Col: React.FunctionComponent<ColProps>;

export default Col;
  