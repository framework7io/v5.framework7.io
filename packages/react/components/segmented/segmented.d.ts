
import * as React from 'react';


interface SegmentedProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  raised ?: boolean;
  raisedIos ?: boolean;
  raisedMd ?: boolean;
  raisedAurora ?: boolean;
  round ?: boolean;
  roundIos ?: boolean;
  roundMd ?: boolean;
  roundAurora ?: boolean;
  strong ?: boolean;
  strongIos ?: boolean;
  strongMd ?: boolean;
  strongAurora ?: boolean;
  tag ?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Segmented: React.FunctionComponent<SegmentedProps>;

export default Segmented;
  