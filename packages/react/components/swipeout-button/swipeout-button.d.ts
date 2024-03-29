
import * as React from 'react';


interface SwipeoutButtonProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  text ?: string;
  confirmTitle ?: string;
  confirmText ?: string;
  overswipe ?: boolean;
  close ?: boolean;
  delete ?: boolean;
  href ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onClick ?: (event?: any) => void;
}
declare const SwipeoutButton: React.FunctionComponent<SwipeoutButtonProps>;

export default SwipeoutButton;
  