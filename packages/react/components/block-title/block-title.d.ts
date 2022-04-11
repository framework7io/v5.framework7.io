
import * as React from 'react';


interface BlockTitleProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  large?: boolean;
  medium?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const BlockTitle: React.FunctionComponent<BlockTitleProps>;

export default BlockTitle;
  