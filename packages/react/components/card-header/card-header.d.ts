
import * as React from 'react';


interface CardHeaderProps {
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
declare const CardHeader: React.FunctionComponent<CardHeaderProps>;

export default CardHeader;
  