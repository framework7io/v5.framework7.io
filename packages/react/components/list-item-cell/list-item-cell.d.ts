
import * as React from 'react';


interface ListItemCellProps {
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
declare const ListItemCell: React.FunctionComponent<ListItemCellProps>;

export default ListItemCell;
  