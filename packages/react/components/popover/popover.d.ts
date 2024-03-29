
import * as React from 'react';

import { Popover } from 'framework7/types';


interface PopoverProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  opened ?: boolean;
  animate ?: boolean;
  targetEl ?: string | object;
  backdrop ?: boolean;
  backdropEl ?: string | object;
  closeByBackdropClick ?: boolean;
  closeByOutsideClick ?: boolean;
  closeOnEscape ?: boolean;
  containerEl ?: string | object;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onPopoverOpen ?: (instance?: Popover.Popover) => void;
  onPopoverOpened ?: (instance?: Popover.Popover) => void;
  onPopoverClose ?: (instance?: Popover.Popover) => void;
  onPopoverClosed ?: (instance?: Popover.Popover) => void;
}
declare const Popover: React.FunctionComponent<PopoverProps>;

export default Popover;
  