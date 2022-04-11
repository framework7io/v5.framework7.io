
import * as React from 'react';


interface NavRightProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  sliding ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const NavRight: React.FunctionComponent<NavRightProps>;

export default NavRight;
  