
import * as React from 'react';


interface MessagebarSheetProps {
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
declare const MessagebarSheet: React.FunctionComponent<MessagebarSheetProps>;

export default MessagebarSheet;
  