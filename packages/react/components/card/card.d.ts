
import * as React from 'react';


interface CardProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  title ?: string | number;
  content ?: string | number;
  footer ?: string | number;
  outline ?: boolean;
  expandable ?: boolean;
  expandableAnimateWidth ?: boolean;
  expandableOpened ?: boolean;
  animate ?: boolean;
  hideNavbarOnOpen ?: boolean;
  hideToolbarOnOpen ?: boolean;
  hideStatusbarOnOpen ?: boolean;
  scrollableEl ?: string;
  swipeToClose ?: boolean;
  closeByBackdropClick ?: boolean;
  backdrop ?: boolean;
  backdropEl ?: string;
  noShadow ?: boolean;
  noBorder ?: boolean;
  padding ?: boolean;
  color ?: string;
  colorTheme ?: string;
  textColor ?: string;
  bgColor ?: string;
  borderColor ?: string;
  rippleColor ?: string;
  themeDark ?: boolean;
  onCardBeforeOpen ?: (el?: HTMLElement, prevent?: any) => void;
  onCardOpen ?: (el?: HTMLElement) => void;
  onCardOpened ?: (el?: HTMLElement, pageEl?: HTMLElement) => void;
  onCardClose ?: (el?: HTMLElement) => void;
  onCardClosed ?: (el?: HTMLElement, pageEl?: HTMLElement) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Card: React.FunctionComponent<CardProps>;

export default Card;
  