
import * as React from 'react';


interface MessagesProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  autoLayout ?: boolean;
  messages ?: Array<any>;
  newMessagesFirst ?: boolean;
  scrollMessages ?: boolean;
  scrollMessagesOnEdge ?: boolean;
  typing?: boolean;
  firstMessageRule ?: Function;
  lastMessageRule ?: Function;
  tailMessageRule ?: Function;
  sameNameMessageRule ?: Function;
  sameHeaderMessageRule ?: Function;
  sameFooterMessageRule ?: Function;
  sameAvatarMessageRule ?: Function;
  customClassMessageRule ?: Function;
  renderMessage ?: Function;
  init ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Messages: React.FunctionComponent<MessagesProps>;

export default Messages;
  