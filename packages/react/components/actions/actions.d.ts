
import * as React from 'react';

import { Actions } from 'framework7/types';


interface ActionsProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  opened ?: boolean;
  animate ?: boolean;
  grid ?: boolean;
  convertToPopover ?: boolean;
  forceToPopover ?: boolean;
  target ?: string | object;
  backdrop ?: boolean;
  backdropEl ?: string | object;
  closeByBackdropClick ?: boolean;
  closeByOutsideClick ?: boolean;
  closeOnEscape ?: boolean;
  onActionsOpen ?: (instance?: Actions.Actions) => void;
  onActionsOpened ?: (instance?: Actions.Actions) => void;
  onActionsClose ?: (instance?: Actions.Actions) => void;
  onActionsClosed ?: (instance?: Actions.Actions) => void;
  containerEl ?: string | object;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Actions: React.FunctionComponent<ActionsProps>;

export default Actions;
  