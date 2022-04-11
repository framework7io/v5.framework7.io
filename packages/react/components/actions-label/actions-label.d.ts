
import * as React from 'react';


interface ActionsLabelProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  bold?: boolean;
  onClick?: (event?: any) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const ActionsLabel: React.FunctionComponent<ActionsLabelProps>;

export default ActionsLabel;
  