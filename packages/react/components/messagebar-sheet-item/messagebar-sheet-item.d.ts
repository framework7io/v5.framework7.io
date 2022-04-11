
import * as React from 'react';


interface MessagebarSheetItemProps {
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
declare const MessagebarSheetItem: React.FunctionComponent<MessagebarSheetItemProps>;

export default MessagebarSheetItem;
  