
import * as React from 'react';


interface ProgressbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  progress ?: number;
  infinite ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Progressbar: React.FunctionComponent<ProgressbarProps>;

export default Progressbar;
  