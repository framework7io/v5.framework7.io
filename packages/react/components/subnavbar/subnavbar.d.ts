
import * as React from 'react';


interface SubnavbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  sliding ?: boolean;
  title ?: string;
  inner ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Subnavbar: React.FunctionComponent<SubnavbarProps>;

export default Subnavbar;
  