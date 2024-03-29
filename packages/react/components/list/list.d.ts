
import * as React from 'react';


interface ListProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  inset ?: boolean;
  xsmallInset ?: boolean;
  smallInset ?: boolean;
  mediumInset ?: boolean;
  largeInset ?: boolean;
  xlargeInset ?: boolean;
  mediaList ?: boolean;
  sortable ?: boolean;
  sortableTapHold ?: boolean;
  sortableEnabled ?: boolean;
  sortableMoveElements ?: boolean;
  sortableOpposite ?: boolean;
  accordionList ?: boolean;
  accordionOpposite ?: boolean;
  contactsList ?: boolean;
  simpleList ?: boolean;
  linksList ?: boolean;
  menuList ?: boolean;
  noHairlines ?: boolean;
  noHairlinesBetween ?: boolean;
  noHairlinesMd ?: boolean;
  noHairlinesBetweenMd ?: boolean;
  noHairlinesIos ?: boolean;
  noHairlinesBetweenIos ?: boolean;
  noHairlinesAurora ?: boolean;
  noHairlinesBetweenAurora ?: boolean;
  noChevron ?: boolean;
  chevronCenter ?: boolean;
  tab ?: boolean;
  tabActive ?: boolean;
  form ?: boolean;
  formStoreData ?: boolean;
  inlineLabels ?: boolean;
  virtualList ?: boolean;
  virtualListParams ?: Object;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onVirtualItemBeforeInsert ?: (vl?: VirtualList.VirtualList, itemEl?: HTMLElement, item?: any) => void;
  onVirtualBeforeClear ?: (vl?: VirtualList.VirtualList, fragment?: any) => void;
  onVirtualItemsBeforeInsert ?: (vl?: VirtualList.VirtualList, fragment?: any) => void;
  onVirtualItemsAfterInsert ?: (vl?: VirtualList.VirtualList, fragment?: any) => void;
  onSubmit ?: (event?: any) => void;
  onSortableEnable ?: (...args: any[]) => void;
  onSortableDisable ?: (...args: any[]) => void;
  onSortableSort ?: (sortData?: any) => void;
  onTabShow ?: (el?: HTMLElement) => void;
  onTabHide ?: (el?: HTMLElement) => void;
}
declare const List: React.FunctionComponent<ListProps>;

export default List;
  