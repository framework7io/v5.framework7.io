
import * as React from 'react';


interface MenuDropdownProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentHeight ?: string;
  position ?: string;
  left ?: boolean;
  center ?: boolean;
  right ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const MenuDropdown: React.FunctionComponent<MenuDropdownProps>;

export default MenuDropdown;
  