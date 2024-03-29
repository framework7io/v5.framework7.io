
import * as React from 'react';


interface NavLeftProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  backLink ?: boolean | string;
  backLinkUrl ?: string;
  backLinkForce ?: boolean;
  backLinkShowText ?: boolean;
  sliding ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onBackClick ?: (event?: any) => void;
  onClickBack ?: (event?: any) => void;
}
declare const NavLeft: React.FunctionComponent<NavLeftProps>;

export default NavLeft;
  