
import * as React from 'react';


interface CheckboxProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  checked ?: boolean;
  indeterminate ?: boolean;
  name ?: number | string;
  value ?: number | string | boolean;
  disabled ?: boolean;
  readonly ?: boolean;
  defaultChecked ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onChange ?: (event?: any) => void;
}
declare const Checkbox: React.FunctionComponent<CheckboxProps>;

export default Checkbox;
  