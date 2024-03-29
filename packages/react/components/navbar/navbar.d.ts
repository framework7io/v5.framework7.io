
import * as React from 'react';


interface NavbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  backLink ?: boolean | string;
  backLinkUrl ?: string;
  backLinkForce ?: boolean;
  backLinkShowText ?: boolean;
  sliding ?: boolean;
  title ?: string;
  subtitle ?: string;
  hidden ?: boolean;
  noShadow ?: boolean;
  noHairline ?: boolean;
  innerClass ?: string;
  innerClassName ?: string;
  large ?: boolean;
  largeTransparent ?: boolean;
  transparent ?: boolean;
  titleLarge ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onNavbarHide ?: (...args: any[]) => void;
  onNavbarShow ?: (...args: any[]) => void;
  onNavbarExpand ?: (...args: any[]) => void;
  onNavbarCollapse ?: (...args: any[]) => void;
  onNavbarTransparentShow ?: (...args: any[]) => void;
  onNavbarTransparentHide ?: (...args: any[]) => void;
  onBackClick ?: (event?: any) => void;
  onClickBack ?: (event?: any) => void;
}
declare const Navbar: React.FunctionComponent<NavbarProps>;

export default Navbar;
  