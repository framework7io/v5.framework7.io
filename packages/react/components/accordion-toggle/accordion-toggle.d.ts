
import * as React from 'react';


interface AccordionToggleProps {
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
declare const AccordionToggle: React.FunctionComponent<AccordionToggleProps>;

export default AccordionToggle;
  