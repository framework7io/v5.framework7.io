
import * as React from 'react';


interface MessageProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  text ?: string;
  name ?: string;
  avatar ?: string;
  type ?: string;
  image ?: string;
  header ?: string;
  footer ?: string;
  textHeader ?: string;
  textFooter ?: string;
  first ?: boolean;
  last ?: boolean;
  tail ?: boolean;
  sameName ?: boolean;
  sameHeader ?: boolean;
  sameFooter ?: boolean;
  sameAvatar ?: boolean;
  typing ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onClick ?: (event?: any) => void;
  onClickName ?: (event?: any) => void;
  onClickText ?: (event?: any) => void;
  onClickAvatar ?: (event?: any) => void;
  onClickHeader ?: (event?: any) => void;
  onClickFooter ?: (event?: any) => void;
  onClickBubble ?: (event?: any) => void;
}
declare const Message: React.FunctionComponent<MessageProps>;

export default Message;
  