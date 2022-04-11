
import * as React from 'react';


interface ActionsGroupProps {
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
declare const ActionsGroup: React.FunctionComponent<ActionsGroupProps>;

export default ActionsGroup;
  