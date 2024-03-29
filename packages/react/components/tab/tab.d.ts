
import * as React from 'react';


interface TabProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  tabActive ?: boolean;
  onTabShow ?: (el?: HTMLElement) => void;
  onTabHide ?: (el?: HTMLElement) => void;
}
declare const Tab: React.FunctionComponent<TabProps>;

export default Tab;
  