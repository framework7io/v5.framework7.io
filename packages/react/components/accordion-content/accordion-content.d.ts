
import * as React from 'react';


interface AccordionContentProps {
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
declare const AccordionContent: React.FunctionComponent<AccordionContentProps>;

export default AccordionContent;
  