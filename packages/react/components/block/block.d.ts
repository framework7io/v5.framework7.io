
import * as React from 'react';


interface BlockProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  inset?: boolean;
  xsmallInset?: boolean;
  smallInset?: boolean;
  mediumInset?: boolean;
  largeInset?: boolean;
  xlargeInset?: boolean;
  strong?: boolean;
  tabs?: boolean;
  tab?: boolean;
  tabActive?: boolean;
  accordionList?: boolean;
  accordionOpposite?: boolean;
  noHairlines?: boolean;
  noHairlinesMd?: boolean;
  noHairlinesIos?: boolean;
  noHairlinesAurora?: boolean;
  onTabShow?: (el?: HTMLElement) => void;
  onTabHide?: (el?: HTMLElement) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Block: React.FunctionComponent<BlockProps>;

export default Block;
  