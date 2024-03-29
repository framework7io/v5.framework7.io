
import * as React from 'react';


interface AppbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  noShadow?: boolean;
  noHairline?: boolean;
  inner?: boolean;
  innerClass?: string;
  innerClassName?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Appbar: React.FunctionComponent<AppbarProps>;

export default Appbar;
  