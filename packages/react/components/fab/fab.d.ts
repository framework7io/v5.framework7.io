
import * as React from 'react';


interface FabProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  morphTo ?: string;
  href ?: boolean | string;
  target ?: string;
  text ?: string;
  position ?: string;
  tooltip ?: string;
  tooltipTrigger ?: string;
  onClick ?: (event?: any) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Fab: React.FunctionComponent<FabProps>;

export default Fab;
  