
import * as React from 'react';


interface IconProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  material ?: string;
  f7 ?: string;
  icon ?: string;
  ios ?: string;
  aurora ?: string;
  md ?: string;
  tooltip ?: string;
  tooltipTrigger ?: string;
  size ?: string | number;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Icon: React.FunctionComponent<IconProps>;

export default Icon;
  