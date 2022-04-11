
import * as React from 'react';


interface FabButtonsProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  position?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const FabButtons: React.FunctionComponent<FabButtonsProps>;

export default FabButtons;
  