
import * as React from 'react';

import { Messagebar } from 'framework7/types';


interface MessagebarProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  sheetVisible ?: boolean;
  attachmentsVisible ?: boolean;
  top ?: boolean;
  resizable ?: boolean;
  bottomOffset ?: number;
  topOffset ?: number;
  maxHeight ?: number;
  resizePage ?: boolean;
  sendLink ?: string;
  value ?: string | number | Array<any>;
  disabled ?: boolean;
  readonly ?: boolean;
  textareaId ?: number | string;
  name ?: string;
  placeholder ?: string;
  init ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onChange ?: (event?: any) => void;
  onInput ?: (event?: any) => void;
  onFocus ?: (event?: any) => void;
  onBlur ?: (event?: any) => void;
  onSubmit ?: (value?: any, clear?: any) => void;
  onSend ?: (value?: any, clear?: any) => void;
  onClick ?: (event?: any) => void;
  onMessagebarAttachmentDelete ?: (instance?: Messagebar.Messagebar, attachmentEl?: HTMLElement, attachmentElIndex?: number) => void;
  onMessagebarAttachmentClick ?: (instance?: Messagebar.Messagebar, attachmentEl?: HTMLElement, attachmentElIndex?: number) => void;
  onMessagebarResizePage ?: (instance?: Messagebar.Messagebar) => void;
}
declare const Messagebar: React.FunctionComponent<MessagebarProps>;

export default Messagebar;
  