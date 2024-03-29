
import * as React from 'react';


interface CardContentProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  padding?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const CardContent: React.FunctionComponent<CardContentProps>;

export default CardContent;
  