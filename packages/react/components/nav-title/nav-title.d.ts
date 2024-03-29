
import * as React from 'react';


interface NavTitleProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  title ?: string;
  subtitle ?: string;
  sliding ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const NavTitle: React.FunctionComponent<NavTitleProps>;

export default NavTitle;
  