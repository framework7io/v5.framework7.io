
import * as React from 'react';


interface AccordionItemProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  opened?: boolean;
  onAccordionBeforeOpen ?: (prevent?: any) => void;
  onAccordionOpen ?: (...args: any[]) => void;
  onAccordionOpened ?: (...args: any[]) => void;
  onAccordionBeforeClose ?: (prevent?: any) => void;
  onAccordionClose ?: (...args: any[]) => void;
  onAccordionClosed ?: (...args: any[]) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const AccordionItem: React.FunctionComponent<AccordionItemProps>;

export default AccordionItem;
  