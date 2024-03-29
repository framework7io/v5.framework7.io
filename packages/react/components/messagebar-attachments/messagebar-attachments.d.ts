
import * as React from 'react';


interface MessagebarAttachmentsProps {
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
declare const MessagebarAttachments: React.FunctionComponent<MessagebarAttachmentsProps>;

export default MessagebarAttachments;
  