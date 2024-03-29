
import * as React from 'react';


interface ToggleProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  init ?: boolean;
  checked ?: boolean;
  defaultChecked ?: boolean;
  disabled ?: boolean;
  readonly ?: boolean;
  name ?: string;
  value ?: string | number | Array<any>;
  tooltip ?: string;
  tooltipTrigger ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onToggleChange ?: (...args: any[]) => void;
  onChange ?: (event?: any) => void;
}
declare const Toggle: React.FunctionComponent<ToggleProps>;

export default Toggle;
  