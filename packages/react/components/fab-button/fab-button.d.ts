
import * as React from 'react';


interface FabButtonProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  fabClose ?: boolean;
  label ?: string;
  target ?: string;
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
declare const FabButton: React.FunctionComponent<FabButtonProps>;

export default FabButton;
  