
import * as React from 'react';


interface MessagebarSheetImageProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  image ?: string;
  checked ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onChecked ?: (event?: any) => void;
  onUnchecked ?: (event?: any) => void;
  onChange ?: (event?: any) => void;
}
declare const MessagebarSheetImage: React.FunctionComponent<MessagebarSheetImageProps>;

export default MessagebarSheetImage;
  