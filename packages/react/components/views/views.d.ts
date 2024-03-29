
import * as React from 'react';


interface ViewsProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  tabs?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Views: React.FunctionComponent<ViewsProps>;

export default Views;
  