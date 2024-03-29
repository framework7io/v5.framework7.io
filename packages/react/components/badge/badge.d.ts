
import * as React from 'react';

import { Tooltip } from 'framework7/types';


interface BadgeProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  tooltip?: string;
  tooltipTrigger?: string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Badge: React.FunctionComponent<BadgeProps>;

export default Badge;
  