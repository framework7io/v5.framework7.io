
import * as React from 'react';


interface TreeviewProps {
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
}
declare const Treeview: React.FunctionComponent<TreeviewProps>;

export default Treeview;
  