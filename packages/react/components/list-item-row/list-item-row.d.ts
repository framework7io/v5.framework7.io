
import * as React from 'react';


interface ListItemRowProps {
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
declare const ListItemRow: React.FunctionComponent<ListItemRowProps>;

export default ListItemRow;
  