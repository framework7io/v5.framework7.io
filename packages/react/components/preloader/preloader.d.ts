
import * as React from 'react';


interface PreloaderProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  size ?: number | string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Preloader: React.FunctionComponent<PreloaderProps>;

export default Preloader;
  