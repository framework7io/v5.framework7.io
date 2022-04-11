
import * as React from 'react';


interface SwipeoutActionsProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  left ?: boolean;
  right ?: boolean;
  side ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const SwipeoutActions: React.FunctionComponent<SwipeoutActionsProps>;

export default SwipeoutActions;
  