
import * as React from 'react';


interface BlockFooterProps {
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
declare const BlockFooter: React.FunctionComponent<BlockFooterProps>;

export default BlockFooter;
  