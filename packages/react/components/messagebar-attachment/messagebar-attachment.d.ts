
import * as React from 'react';


interface MessagebarAttachmentProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  image ?: string;
  deletable ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onAttachmentClick ?: (event?: any) => void;
  onAttachmentDelete ?: (event?: any) => void;
}
declare const MessagebarAttachment: React.FunctionComponent<MessagebarAttachmentProps>;

export default MessagebarAttachment;
  