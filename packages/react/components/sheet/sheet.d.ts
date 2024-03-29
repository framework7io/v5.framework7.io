
import * as React from 'react';

import { Sheet } from 'framework7/types';


interface SheetProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  opened ?: boolean;
  animate ?: boolean;
  top ?: boolean;
  bottom ?: boolean;
  position ?: string;
  backdrop ?: boolean;
  backdropEl ?: string | object;
  closeByBackdropClick ?: boolean;
  closeByOutsideClick ?: boolean;
  closeOnEscape ?: boolean;
  push ?: boolean;
  swipeToClose ?: boolean;
  swipeToStep ?: boolean;
  swipeHandler ?: string | object;
  containerEl ?: string | object;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onSheetStepProgress ?: (instance?: Sheet.Sheet, progress?: any) => void;
  onSheetStepOpen ?: (instance?: Sheet.Sheet) => void;
  onSheetStepClose ?: (instance?: Sheet.Sheet) => void;
  onSheetOpen ?: (instance?: Sheet.Sheet) => void;
  onSheetOpened ?: (instance?: Sheet.Sheet) => void;
  onSheetClose ?: (instance?: Sheet.Sheet) => void;
  onSheetClosed ?: (instance?: Sheet.Sheet) => void;
}
declare const Sheet: React.FunctionComponent<SheetProps>;

export default Sheet;
  