
import * as React from 'react';


interface ListIndexProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  init ?: boolean;
  listEl ?: string | object;
  indexes ?: string | Array<any>;
  scrollList ?: boolean;
  label ?: boolean;
  iosItemHeight ?: number;
  mdItemHeight ?: number;
  auroraItemHeight ?: number;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onListIndexSelect ?: (itemContent?: any, itemIndex?: any) => void;
}
declare const ListIndex: React.FunctionComponent<ListIndexProps>;

export default ListIndex;
  