
import * as React from 'react';


interface AccordionProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  accordionOpposite?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Accordion: React.FunctionComponent<AccordionProps>;

export default Accordion;
  