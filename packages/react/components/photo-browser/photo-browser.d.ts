
import * as React from 'react';


interface PhotoBrowserProps {
  slot?: string;
  init ?: boolean;
  params ?: Object;
  photos ?: Array<any>;
  exposition ?: boolean;
  expositionHideCaptions ?: boolean;
  type ?: string;
  navbar ?: boolean;
  toolbar ?: boolean;
  theme ?: string;
  captionsTheme ?: string;
  iconsColor ?: string;
  swipeToClose ?: boolean;
  pageBackLinkText ?: string;
  popupCloseLinkText ?: string;
  navbarOfText ?: string;
  navbarShowCount ?: boolean;
  swiper ?: Object;
  url ?: string;
  routableModals ?: boolean;
  virtualSlides ?: boolean;
  view ?: string | object;
  renderNavbar ?: Function;
  renderToolbar ?: Function;
  renderCaption ?: Function;
  renderObject ?: Function;
  renderLazyPhoto ?: Function;
  renderPhoto ?: Function;
  renderPage ?: Function;
  renderPopup ?: Function;
  renderStandalone ?: Function;
  onPhotoBrowserOpen ?: (...args: any[]) => void;
  onPhotoBrowserClose ?: (...args: any[]) => void;
  onPhotoBrowserOpened ?: (...args: any[]) => void;
  onPhotoBrowserClosed ?: (...args: any[]) => void;
  onPhotoBrowserSwipeToClose ?: (...args: any[]) => void;
}
declare const PhotoBrowser: React.FunctionComponent<PhotoBrowserProps>;

export default PhotoBrowser;
  