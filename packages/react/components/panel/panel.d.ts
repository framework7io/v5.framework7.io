
import * as React from 'react';


interface PanelProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  side ?: string;
  effect ?: string;
  cover ?: boolean;
  reveal ?: boolean;
  left ?: boolean;
  right ?: boolean;
  opened ?: boolean;
  resizable ?: boolean;
  backdrop ?: boolean;
  backdropEl ?: string;
  visibleBreakpoint ?: number;
  collapsedBreakpoint ?: number;
  swipe ?: boolean;
  swipeNoFollow ?: boolean;
  swipeOnlyClose ?: boolean;
  swipeActiveArea ?: number;
  swipeThreshold ?: number;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onPanelOpen ?: (event?: any) => void;
  onPanelOpened ?: (event?: any) => void;
  onPanelClose ?: (event?: any) => void;
  onPanelClosed ?: (event?: any) => void;
  onPanelBackdropClick ?: (event?: any) => void;
  onPanelSwipe ?: (event?: any) => void;
  onPanelSwipeOpen ?: (event?: any) => void;
  onPanelBreakpoint ?: (event?: any) => void;
  onPanelCollapsedBreakpoint ?: (event?: any) => void;
  onPanelResize ?: (...args: any[]) => void;
}
declare const Panel: React.FunctionComponent<PanelProps>;

export default Panel;
  