
import * as React from 'react';


interface ListButtonProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  title ?: string | number;
  text ?: string | number;
  tabLink ?: boolean | string;
  tabLinkActive ?: boolean;
  link ?: boolean | string;
  href ?: boolean | string;
  target ?: string;
  tooltip ?: string;
  tooltipTrigger ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  back?: boolean;
  external?: boolean;
  force?: boolean;
  animate?: boolean;
  ignoreCache?: boolean;
  reloadCurrent?: boolean;
  reloadAll?: boolean;
  reloadPrevious?: boolean;
  reloadDetail?: boolean;
  routeTabId?: string;
  view?: string;
  routeProps?: any;
  preventRouter?: boolean;
  transition?: string;
  openIn?: string;
  searchbarEnable?: boolean | string;
  searchbarDisable?: boolean | string;
  searchbarClear?: boolean | string;
  searchbarToggle?: boolean | string;
  panelOpen?: boolean | string;
  panelClose?: boolean | string;
  panelToggle?: boolean | string;
  popupOpen?: boolean | string;
  popupClose?: boolean | string;
  actionsOpen?: boolean | string;
  actionsClose?: boolean | string;
  popoverOpen?: boolean | string;
  popoverClose?: boolean | string;
  loginScreenOpen?: boolean | string;
  loginScreenClose?: boolean | string;
  sheetOpen?: boolean | string;
  sheetClose?: boolean | string;
  sortableEnable?: boolean | string;
  sortableDisable?: boolean | string;
  sortableToggle?: boolean | string;
  cardOpen?: boolean | string;
  cardPreventOpen?: boolean | string;
  cardClose?: boolean | string;
  menuClose?: boolean | string;
  onClick ?: (event?: any) => void;
}
declare const ListButton: React.FunctionComponent<ListButtonProps>;

export default ListButton;
  