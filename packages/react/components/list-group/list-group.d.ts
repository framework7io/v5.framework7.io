
import * as React from 'react';


interface ListGroupProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  mediaList ?: boolean;
  sortable ?: boolean;
  sortableOpposite ?: boolean;
  sortableTapHold ?: boolean;
  sortableMoveElements ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const ListGroup: React.FunctionComponent<ListGroupProps>;

export default ListGroup;
  