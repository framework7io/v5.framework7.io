
import * as React from 'react';


interface PageContentProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  tab ?: boolean;
  tabActive ?: boolean;
  ptr ?: boolean;
  ptrDistance ?: number;
  ptrPreloader ?: boolean;
  ptrBottom ?: boolean;
  ptrMousewheel ?: boolean;
  infinite ?: boolean;
  infiniteTop ?: boolean;
  infiniteDistance ?: number;
  infinitePreloader ?: boolean;
  hideBarsOnScroll ?: boolean;
  hideNavbarOnScroll ?: boolean;
  hideToolbarOnScroll ?: boolean;
  messagesContent ?: boolean;
  loginScreen ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onPtrPullStart ?: (...args: any[]) => void;
  onPtrPullMove ?: (...args: any[]) => void;
  onPtrPullEnd ?: (...args: any[]) => void;
  onPtrRefresh ?: (done?: any) => void;
  onPtrDone ?: (...args: any[]) => void;
  onInfinite ?: (...args: any[]) => void;
  onTabShow ?: (el?: HTMLElement) => void;
  onTabHide ?: (el?: HTMLElement) => void;
}
declare const PageContent: React.FunctionComponent<PageContentProps>;

export default PageContent;
  