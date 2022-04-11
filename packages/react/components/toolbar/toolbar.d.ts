
import * as React from 'react';


interface ToolbarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  tabbar ?: boolean;
  labels ?: boolean;
  scrollable ?: boolean;
  hidden ?: boolean;
  noShadow ?: boolean;
  noHairline ?: boolean;
  noBorder ?: boolean;
  position ?: string;
  topMd ?: boolean;
  topIos ?: boolean;
  topAurora ?: boolean;
  top ?: boolean;
  bottomMd ?: boolean;
  bottomIos ?: boolean;
  bottomAurora ?: boolean;
  bottom ?: boolean;
  inner ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onToolbarHide ?: (...args: any[]) => void;
  onToolbarShow ?: (...args: any[]) => void;
}
declare const Toolbar: React.FunctionComponent<ToolbarProps>;

export default Toolbar;
  